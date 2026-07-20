//! Swap execution: two-phase prepare/start, coarse progress, recovery.
//!
//! No per-maker live progress — coinswap's tracker types are `pub(crate)`,
//! so `get_swap_progress` only reports coarse lifecycle (docs/BACKEND.md §8).

use std::str::FromStr;
use std::time::SystemTime;

use coinswap::bitcoin::{Amount, OutPoint, Txid};
use coinswap::protocol::ProtocolVersion;
use coinswap::taker::{SwapParams, SwapSummary};
use tauri::{Emitter, Manager};

use crate::error::{AppError, ErrorCode};
use crate::state::{try_lock_taker, ActiveSwap, AppState, SwapLifecycle};
use crate::types::{
    MakerFeeInfoDto, ProtocolVersionDto, RecoveryStatus, SwapProgressDto, SwapRequest,
    SwapSummaryDto,
};

fn protocol_label(p: ProtocolVersion) -> &'static str {
    match p {
        ProtocolVersion::Legacy => "legacy",
        ProtocolVersion::Taproot => "taproot",
    }
}

fn to_summary_dto(s: &SwapSummary) -> SwapSummaryDto {
    SwapSummaryDto {
        swap_id: s.swap_id.clone(),
        protocol: protocol_label(s.protocol).to_string(),
        send_amount_sats: s.send_amount.to_sat(),
        makers: s
            .makers
            .iter()
            .map(|m| MakerFeeInfoDto {
                address: m.address.clone(),
                protocol: protocol_label(m.protocol).to_string(),
                base_fee: m.base_fee,
                amount_relative_fee_pct: m.amount_relative_fee_pct,
                time_relative_fee_pct: m.time_relative_fee_pct,
                locktime: m.locktime,
                estimated_fee_sats: m.estimated_fee_sats,
            })
            .collect(),
        total_estimated_fee_sats: s.total_estimated_fee.to_sat(),
        estimated_receive_amount_sats: s.estimated_receive_amount.to_sat(),
    }
}

fn phase_label(phase: SwapLifecycle) -> &'static str {
    match phase {
        SwapLifecycle::Prepared => "prepared",
        SwapLifecycle::Running => "running",
        SwapLifecycle::Recovering => "recovering",
        SwapLifecycle::Finished => "finished",
        SwapLifecycle::Failed => "failed",
    }
}

/// Phase 1: maker discovery + negotiation, no funds committed. Summary is
/// for a confirmation screen before calling start_swap.
#[tauri::command]
pub async fn prepare_swap(
    state: tauri::State<'_, AppState>,
    request: SwapRequest,
) -> Result<SwapSummaryDto, AppError> {
    if let Some(active) = state.active_swap.lock()?.as_ref() {
        if active.phase == SwapLifecycle::Running {
            return Err(AppError::swap_in_progress());
        }
    }
    if request.maker_count < 2 {
        return Err(AppError::new(
            ErrorCode::InvalidInput,
            "maker_count must be at least 2 for route privacy",
        ));
    }

    let protocol = match request.protocol {
        ProtocolVersionDto::Legacy => ProtocolVersion::Legacy,
        ProtocolVersionDto::Taproot => ProtocolVersion::Taproot,
    };
    let mut params = SwapParams::new(protocol, Amount::from_sat(request.amount_sats), request.maker_count);
    if let Some(outpoints) = request.outpoints {
        let converted = outpoints
            .into_iter()
            .map(|o| -> Result<OutPoint, AppError> {
                let txid = Txid::from_str(&o.txid)
                    .map_err(|e| AppError::new(ErrorCode::InvalidInput, e.to_string()))?;
                Ok(OutPoint::new(txid, o.vout))
            })
            .collect::<Result<Vec<_>, _>>()?;
        params = params.with_utxos(converted);
    }
    if let Some(preferred) = request.preferred_makers {
        params = params.with_preferred_makers(preferred);
    }

    let taker = state.taker.clone();
    let summary = tauri::async_runtime::spawn_blocking(move || -> Result<SwapSummary, AppError> {
        let mut guard = try_lock_taker(&taker)?;
        let taker = guard.as_mut().ok_or_else(AppError::not_initialized)?;
        Ok(taker.prepare_coinswap(params)?)
    })
    .await
    .map_err(AppError::internal)??;

    let dto = to_summary_dto(&summary);
    *state.active_swap.lock()? = Some(ActiveSwap {
        swap_id: summary.swap_id,
        summary: dto.clone(),
        phase: SwapLifecycle::Prepared,
        started_at: None,
        error: None,
    });
    Ok(dto)
}

/// Phase 2: commits funds, can run for hours — dedicated thread, not
/// spawn_blocking. Result via swap://finished / swap://failed events.
#[tauri::command]
pub async fn start_swap(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    swap_id: String,
) -> Result<(), AppError> {
    {
        let mut guard = state.active_swap.lock()?;
        match guard.as_mut() {
            Some(active) if active.swap_id == swap_id && active.phase == SwapLifecycle::Prepared => {
                active.phase = SwapLifecycle::Running;
                active.started_at = Some(SystemTime::now());
            }
            Some(active) if active.phase == SwapLifecycle::Running => {
                return Err(AppError::swap_in_progress())
            }
            _ => {
                return Err(AppError::new(
                    ErrorCode::InvalidInput,
                    "no prepared swap with this id — call prepare_swap first",
                ))
            }
        }
    }

    let taker = state.taker.clone();
    std::thread::spawn(move || {
        let result = {
            let mut guard = match taker.lock() {
                Ok(g) => g,
                Err(poisoned) => poisoned.into_inner(),
            };
            match guard.as_mut() {
                Some(taker) => taker.start_coinswap(&swap_id),
                None => return, // taker dropped (app shutting down) mid-swap
            }
        };

        let app_state = app.state::<AppState>();
        let mut active_guard = match app_state.active_swap.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        match result {
            // Crate already persists the report to <wallet>_swap_report.json.
            Ok(_report) => {
                if let Some(active) = active_guard.as_mut() {
                    active.phase = SwapLifecycle::Finished;
                }
                let _ = app.emit("swap://finished", &swap_id);
            }
            Err(e) => {
                // ContractsBroadcasted: funds on-chain, crate already started
                // recovery — still "failed" here, UI routes it to Recovery.
                let app_err = AppError::from(e);
                if let Some(active) = active_guard.as_mut() {
                    active.phase = SwapLifecycle::Failed;
                    active.error = Some(app_err.message.clone());
                }
                let _ = app.emit("swap://failed", &app_err);
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn get_swap_progress(
    state: tauri::State<'_, AppState>,
) -> Result<Option<SwapProgressDto>, AppError> {
    let guard = state.active_swap.lock()?;
    Ok(guard.as_ref().map(|active| SwapProgressDto {
        swap_id: active.swap_id.clone(),
        phase: phase_label(active.phase).to_string(),
        started_at: active
            .started_at
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs()),
        error: active.error.clone(),
    }))
}

/// Manual backout trigger; also works cross-session after a crash.
#[tauri::command]
pub async fn recover_swap(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    let taker = state.taker.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), AppError> {
        let mut guard = try_lock_taker(&taker)?;
        let taker = guard.as_mut().ok_or_else(AppError::not_initialized)?;
        Ok(taker.recover_active_swap()?)
    })
    .await
    .map_err(AppError::internal)??;

    if let Some(active) = state.active_swap.lock()?.as_mut() {
        active.phase = SwapLifecycle::Recovering;
    }
    Ok(())
}

#[tauri::command]
pub fn get_recovery_status(state: tauri::State<'_, AppState>) -> Result<RecoveryStatus, AppError> {
    let taker_guard = try_lock_taker(&state.taker)?;
    let taker = taker_guard.as_ref().ok_or_else(AppError::not_initialized)?;
    let complete = taker.is_recovery_complete();

    let wallet = state
        .wallet
        .read()?
        .clone()
        .ok_or_else(AppError::not_initialized)?;
    let pending_contract_count = wallet.read()?.list_live_contract_spend_info().len();

    let recovering = state
        .active_swap
        .lock()?
        .as_ref()
        .map(|a| a.phase == SwapLifecycle::Recovering)
        .unwrap_or(false)
        || (pending_contract_count > 0 && !complete);

    Ok(RecoveryStatus {
        recovering,
        complete,
        pending_contract_count,
    })
}

