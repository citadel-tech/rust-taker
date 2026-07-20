//! Swap reports & deniability. One consolidated file per wallet
//! (`<wallet_name>_swap_report.json`, not per swap id) written by the crate
//! itself — we only read it.

use std::path::PathBuf;

use coinswap::wallet::{SwapReportFile, SwapStatus};

use crate::error::{AppError, ErrorCode};
use crate::state::{try_lock_taker, AppState};
use crate::types::{SwapReportDetail, SwapReportSummary};

fn status_label(s: &SwapStatus) -> &'static str {
    match s {
        SwapStatus::Success => "success",
        SwapStatus::RecoveryHashlock => "recovery_hashlock",
        SwapStatus::RecoveryTimelock => "recovery_timelock",
        SwapStatus::Failed => "failed",
    }
}

fn resolve_report_path(state: &AppState) -> Result<PathBuf, AppError> {
    let data_dir = state
        .data_dir
        .read()?
        .clone()
        .ok_or_else(AppError::not_initialized)?;
    let wallet = state
        .wallet
        .read()?
        .clone()
        .ok_or_else(AppError::not_initialized)?;
    let wallet_name = wallet.read()?.get_name().to_string();
    Ok(data_dir
        .join("wallets")
        .join(format!("{wallet_name}_swap_report.json")))
}

fn load_report_file(path: &PathBuf) -> Result<SwapReportFile, AppError> {
    if !path.exists() {
        return Ok(SwapReportFile::default());
    }
    let contents = std::fs::read_to_string(path)?;
    serde_json::from_str(&contents)
        .map_err(|e| AppError::internal(format!("failed to parse {}: {e}", path.display())))
}

#[tauri::command]
pub async fn list_swap_reports(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<SwapReportSummary>, AppError> {
    let path = resolve_report_path(&state)?;
    let file = tauri::async_runtime::spawn_blocking(move || load_report_file(&path))
        .await
        .map_err(AppError::internal)??;

    Ok(file
        .taker
        .iter()
        .map(|r| SwapReportSummary {
            swap_id: r.swap_id.clone(),
            status: status_label(&r.status).to_string(),
            start_timestamp: r.start_timestamp,
            end_timestamp: r.end_timestamp,
            outgoing_amount_sats: r.outgoing_amount,
            incoming_amount_sats: r.incoming_amount,
            fee_paid_sats: r.fee_paid,
            makers_count: r.makers_count,
        })
        .collect())
}

#[tauri::command]
pub async fn get_swap_report(
    state: tauri::State<'_, AppState>,
    swap_id: String,
) -> Result<SwapReportDetail, AppError> {
    let path = resolve_report_path(&state)?;
    let file = tauri::async_runtime::spawn_blocking(move || load_report_file(&path))
        .await
        .map_err(AppError::internal)??;

    let r = file
        .taker
        .into_iter()
        .find(|r| r.swap_id == swap_id)
        .ok_or_else(|| {
            AppError::new(
                ErrorCode::WalletNotFound,
                format!("no report found for swap_id {swap_id}"),
            )
        })?;

    Ok(SwapReportDetail {
        swap_id: r.swap_id,
        status: status_label(&r.status).to_string(),
        network: r.network,
        swap_duration_seconds: r.swap_duration_seconds,
        start_timestamp: r.start_timestamp,
        end_timestamp: r.end_timestamp,
        error_message: r.error_message,
        outgoing_amount_sats: r.outgoing_amount,
        incoming_amount_sats: r.incoming_amount,
        fee_paid_sats: r.fee_paid,
        mining_fee_sats: r.mining_fee,
        fee_percentage: r.fee_percentage,
        total_maker_fees_sats: r.total_maker_fees,
        outgoing_contract_txid: r.outgoing_contract_txid,
        incoming_contract_txid: r.incoming_contract_txid,
        funding_txids: r.funding_txids,
        makers_count: r.makers_count,
        maker_addresses: r.maker_addresses,
        has_deniability_proof: r.deniability_proof.is_some(),
    })
}

#[tauri::command]
pub async fn verify_deniability(
    state: tauri::State<'_, AppState>,
    swap_id: String,
) -> Result<bool, AppError> {
    let taker = state.taker.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<bool, AppError> {
        let guard = try_lock_taker(&taker)?;
        let taker = guard.as_ref().ok_or_else(AppError::not_initialized)?;
        taker
            .verify_deniability(&swap_id)
            .map_err(|e| AppError::internal(e.to_string()))
    })
    .await
    .map_err(AppError::internal)?
}
