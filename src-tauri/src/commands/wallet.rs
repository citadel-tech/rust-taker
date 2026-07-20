//! Wallet lifecycle: init, shutdown, encryption probe, restore, backup.
//!
//! Wallet load/restore commands must route errors through
//! `from_wallet_join_error`, not `AppError::internal` — a wrong password
//! panics inside the crate instead of returning `Result` (docs/BACKEND.md §7).

use std::path::PathBuf;
use std::str::FromStr;
use std::sync::{Arc, RwLock};

use coinswap::bitcoin::{OutPoint, Txid};
use coinswap::bitcoind::bitcoincore_rpc::Auth;
use coinswap::fee_estimation::FeeEstimator;
use coinswap::nostr_coinswap::NOSTR_RELAYS;
use coinswap::taker::api::ConnectionType;
use coinswap::taker::{Taker, TakerInitConfig};
use coinswap::utill::{get_taker_dir, setup_taker_logger};
use coinswap::wallet::{AddressType, RPCConfig, Wallet};

use crate::error::{from_wallet_join_error, AppError, ErrorCode};
use crate::state::AppState;
use crate::types::{
    AddressTypeDto, BalancesDto, ConnectionTypeDto, FeeEstimate, InitConfig, InitResult,
    NewAddress, Outpoint, RpcSettings, SendResult, SwapLiquidity, TxSummary, UtxoEntry,
    WalletInfo,
};

fn resolve_data_dir(data_dir: &Option<String>) -> PathBuf {
    data_dir
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(get_taker_dir)
}

fn wallet_path(data_dir: &std::path::Path, wallet_name: &str) -> PathBuf {
    data_dir.join("wallets").join(wallet_name)
}

/// Cloning the Arc (not the Wallet) keeps this independent of the taker mutex.
fn get_wallet_handle(state: &AppState) -> Result<Arc<RwLock<Wallet>>, AppError> {
    state
        .wallet
        .read()?
        .clone()
        .ok_or_else(AppError::not_initialized)
}

/// Probes the on-disk format only — never decrypts, no password needed.
#[tauri::command]
pub async fn is_wallet_encrypted(
    data_dir: Option<String>,
    wallet_name: String,
) -> Result<bool, AppError> {
    let path = wallet_path(&resolve_data_dir(&data_dir), &wallet_name);
    tauri::async_runtime::spawn_blocking(move || Wallet::is_wallet_encrypted(&path))
        .await
        .map_err(AppError::internal)?
        .map_err(AppError::from)
}

/// Non-wallet files the crate writes into the same directory (report/lock/temp).
const NON_WALLET_SUFFIXES: &[&str] = &["_swap_report.json", ".lock", ".partial", ".tmp"];

#[tauri::command]
pub fn list_wallets(data_dir: Option<String>) -> Result<Vec<String>, AppError> {
    let dir = resolve_data_dir(&data_dir).join("wallets");
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut names = Vec::new();
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        if entry.file_type()?.is_file() {
            if let Some(name) = entry.file_name().to_str() {
                if !NON_WALLET_SUFFIXES.iter().any(|suf| name.ends_with(suf)) {
                    names.push(name.to_string());
                }
            }
        }
    }
    names.sort();
    Ok(names)
}

/// Creates or loads the wallet, connects to Bitcoin Core, checks Tor,
/// starts background threads. Blocking; can take a few seconds.
#[tauri::command]
pub async fn init_taker(
    state: tauri::State<'_, AppState>,
    config: InitConfig,
) -> Result<InitResult, AppError> {
    {
        let guard = crate::state::try_lock_taker(&state.taker)?;
        if guard.is_some() {
            return Err(AppError::new(
                ErrorCode::Internal,
                "taker is already initialized for this session",
            ));
        }
    }

    let data_dir = resolve_data_dir(&config.data_dir);
    let connection_type = match config.connection_type {
        ConnectionTypeDto::Tor => ConnectionType::Tor,
        ConnectionTypeDto::Clearnet => ConnectionType::Clearnet,
    };

    let init_cfg = TakerInitConfig {
        data_dir: Some(data_dir.clone()),
        wallet_file_name: Some(config.wallet_name.clone()),
        rpc_config: Some(RPCConfig {
            url: format!("{}:{}", config.rpc.host, config.rpc.port),
            auth: Auth::UserPass(config.rpc.username, config.rpc.password),
            wallet_name: String::new(), // overwritten by Taker::init to the wallet file name
        }),
        control_port: config.control_port,
        tor_auth_password: config.tor_auth_password,
        socks_port: config.socks_port.unwrap_or(9050),
        zmq_addr: config.zmq_addr,
        password: config.wallet_password,
        connection_type,
        nostr_relays: NOSTR_RELAYS.iter().map(|s| s.to_string()).collect(),
    };
    let wallet_name = config.wallet_name;

    // One-shot OnceLock inside the crate — must run before Taker::init.
    setup_taker_logger(log::LevelFilter::Info, false, Some(data_dir.clone()));

    let taker = tauri::async_runtime::spawn_blocking(move || Taker::init(init_cfg))
        .await
        .map_err(from_wallet_join_error)?
        .map_err(AppError::from)?;

    let recovery_pending = taker
        .get_wallet()
        .read()
        .map(|w| !w.list_live_contract_spend_info().is_empty())
        .unwrap_or(false);

    *state.wallet.write()? = Some(taker.get_wallet().clone());
    *state.offer_sync.write()? = Some(taker.offer_sync_client());
    *state.data_dir.write()? = Some(data_dir.clone());
    *state.taker.lock()? = Some(taker);

    Ok(InitResult {
        wallet_name,
        data_dir: data_dir.display().to_string(),
        recovery_pending,
    })
}

/// Drops the Taker (flushes state, stops background threads). Best-effort:
/// if a swap is running we skip it rather than hang shutdown — abandoning it
/// is safe, startup recovery picks up unfinished swaps on next init.
pub fn shutdown(state: &AppState) -> Result<(), AppError> {
    if let Ok(mut guard) = state.taker.try_lock() {
        guard.take();
    }
    *state.wallet.write()? = None;
    *state.offer_sync.write()? = None;
    *state.data_dir.write()? = None;
    Ok(())
}

#[tauri::command]
pub fn shutdown_taker(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    shutdown(&state)
}

#[tauri::command]
pub fn get_wallet_info(state: tauri::State<'_, AppState>) -> Result<WalletInfo, AppError> {
    let wallet_name = get_wallet_handle(&state)?.read()?.get_name().to_string();
    let data_dir = state
        .data_dir
        .read()?
        .clone()
        .ok_or_else(AppError::not_initialized)?;
    Ok(WalletInfo {
        wallet_path: wallet_path(&data_dir, &wallet_name).display().to_string(),
        wallet_name,
        data_dir: data_dir.display().to_string(),
    })
}

/// Restore from a backup file; must run before `init_taker` for that wallet
/// name. Two failure modes: a bad password/file panics (caught via
/// from_wallet_join_error); a real WalletError is swallowed by the crate, so
/// we detect that case by checking the restored file actually exists.
#[tauri::command]
pub async fn restore_wallet(
    data_dir: Option<String>,
    wallet_name: String,
    rpc: RpcSettings,
    backup_file_path: String,
    password: Option<String>,
) -> Result<(), AppError> {
    let dir = resolve_data_dir(&data_dir);
    let restored_path = wallet_path(&dir, &wallet_name);
    let rpc_config = RPCConfig {
        url: format!("{}:{}", rpc.host, rpc.port),
        auth: Auth::UserPass(rpc.username, rpc.password),
        wallet_name: wallet_name.clone(),
    };
    let backup_path = PathBuf::from(backup_file_path);

    tauri::async_runtime::spawn_blocking(move || {
        coinswap::wallet::ffi::restore_wallet_gui_app(
            Some(dir),
            Some(wallet_name),
            rpc_config,
            backup_path,
            password,
        )
    })
    .await
    .map_err(from_wallet_join_error)?;

    if !restored_path.exists() {
        return Err(AppError::new(
            ErrorCode::WalletLoadFailed,
            "restore did not produce a wallet file — check the app log for the underlying cause",
        ));
    }
    Ok(())
}

/// Backs up to JSON (xpriv, not a seed phrase). `password: None` = unencrypted.
#[tauri::command]
pub async fn backup_wallet(
    state: tauri::State<'_, AppState>,
    destination_path: String,
    password: Option<String>,
) -> Result<(), AppError> {
    let wallet = get_wallet_handle(&state)?;

    tauri::async_runtime::spawn_blocking(move || -> Result<(), AppError> {
        wallet.read()?.backup_wallet_gui_app(destination_path, password)?;
        Ok(())
    })
    .await
    .map_err(AppError::internal)?
}

// --- Wallet operations: balances, addresses, history, UTXOs, send, sync, fees ---

#[tauri::command]
pub async fn get_balances(state: tauri::State<'_, AppState>) -> Result<BalancesDto, AppError> {
    let wallet = get_wallet_handle(&state)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<BalancesDto, AppError> {
        let b = wallet.read()?.get_balances()?;
        Ok(BalancesDto {
            regular: b.regular.to_sat(),
            swap: b.swap.to_sat(),
            contract: b.contract.to_sat(),
            fidelity: b.fidelity.to_sat(),
            spendable: b.spendable.to_sat(),
        })
    })
    .await
    .map_err(AppError::internal)?
}

/// max_swappable = max(regular, swap) − 3000 sats dust buffer.
#[tauri::command]
pub async fn check_swap_liquidity(
    state: tauri::State<'_, AppState>,
) -> Result<SwapLiquidity, AppError> {
    let wallet = get_wallet_handle(&state)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<SwapLiquidity, AppError> {
        let b = wallet.read()?.get_balances()?;
        let regular = b.regular.to_sat();
        let swap = b.swap.to_sat();
        Ok(SwapLiquidity {
            spendable: b.spendable.to_sat(),
            regular,
            swap,
            max_swappable: regular.max(swap).saturating_sub(3000),
        })
    })
    .await
    .map_err(AppError::internal)?
}

#[tauri::command]
pub async fn get_new_address(
    state: tauri::State<'_, AppState>,
    address_type: AddressTypeDto,
) -> Result<NewAddress, AppError> {
    let wallet = get_wallet_handle(&state)?;
    let (addr_type, label) = match address_type {
        AddressTypeDto::P2wpkh => (AddressType::P2WPKH, "p2wpkh"),
        AddressTypeDto::P2tr => (AddressType::P2TR, "p2tr"),
    };
    tauri::async_runtime::spawn_blocking(move || -> Result<NewAddress, AppError> {
        let address = wallet.write()?.get_next_external_address(addr_type)?;
        Ok(NewAddress {
            address: address.to_string(),
            address_type: label.to_string(),
        })
    })
    .await
    .map_err(AppError::internal)?
}

#[tauri::command]
pub async fn get_transactions(
    state: tauri::State<'_, AppState>,
    count: Option<usize>,
    skip: Option<usize>,
) -> Result<Vec<TxSummary>, AppError> {
    let wallet = get_wallet_handle(&state)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<TxSummary>, AppError> {
        let txs = wallet.read()?.get_transactions(count, skip)?;
        Ok(txs
            .into_iter()
            .map(|tx| TxSummary {
                txid: tx.info.txid.to_string(),
                category: format!("{:?}", tx.detail.category).to_lowercase(),
                amount_sats: tx.detail.amount.to_sat(),
                confirmations: tx.info.confirmations,
                address: tx.detail.address.map(|a| a.assume_checked().to_string()),
                time: tx.info.time,
                fee_sats: tx.detail.fee.map(|f| f.to_sat()),
            })
            .collect())
    })
    .await
    .map_err(AppError::internal)?
}

#[tauri::command]
pub async fn list_utxos(state: tauri::State<'_, AppState>) -> Result<Vec<UtxoEntry>, AppError> {
    let wallet = get_wallet_handle(&state)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<UtxoEntry>, AppError> {
        let utxos = wallet.read()?.list_all_utxo_spend_info();
        Ok(utxos
            .into_iter()
            .map(|(entry, spend_info)| UtxoEntry {
                txid: entry.txid.to_string(),
                vout: entry.vout,
                amount_sats: entry.amount.to_sat(),
                confirmations: entry.confirmations,
                address: entry.address.map(|a| a.assume_checked().to_string()),
                spendable: entry.spendable,
                solvable: entry.solvable,
                spend_type: spend_info.to_string(),
            })
            .collect())
    })
    .await
    .map_err(AppError::internal)?
}

/// `fee_rate` defaults to 2 sat/vB when omitted.
#[tauri::command]
pub async fn send_to_address(
    state: tauri::State<'_, AppState>,
    address: String,
    amount_sats: u64,
    fee_rate: Option<f64>,
    outpoints: Option<Vec<Outpoint>>,
) -> Result<SendResult, AppError> {
    let wallet = get_wallet_handle(&state)?;
    let outpoints = outpoints
        .map(|list| {
            list.into_iter()
                .map(|o| -> Result<OutPoint, AppError> {
                    let txid = Txid::from_str(&o.txid)
                        .map_err(|e| AppError::new(ErrorCode::InvalidInput, e.to_string()))?;
                    Ok(OutPoint::new(txid, o.vout))
                })
                .collect::<Result<Vec<_>, _>>()
        })
        .transpose()?;

    tauri::async_runtime::spawn_blocking(move || -> Result<SendResult, AppError> {
        let txid = wallet
            .write()?
            .send_to_address(amount_sats, address, fee_rate, outpoints)?;
        Ok(SendResult {
            txid: txid.to_string(),
        })
    })
    .await
    .map_err(AppError::internal)?
}

#[tauri::command]
pub async fn sync_wallet(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    let wallet = get_wallet_handle(&state)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), AppError> {
        wallet.write()?.sync_and_save()?;
        Ok(())
    })
    .await
    .map_err(AppError::internal)?
}

/// Hits mempool.space/esplora over clearnet regardless of Tor setting.
#[tauri::command]
pub async fn estimate_fees() -> Result<FeeEstimate, AppError> {
    tauri::async_runtime::spawn_blocking(|| -> Result<FeeEstimate, AppError> {
        let estimator = FeeEstimator::new(None);
        Ok(FeeEstimate {
            high: estimator
                .get_high_priority_rate()
                .map_err(AppError::internal)?,
            mid: estimator
                .get_mid_priority_rate()
                .map_err(AppError::internal)?,
            low: estimator
                .get_low_priority_rate()
                .map_err(AppError::internal)?,
        })
    })
    .await
    .map_err(AppError::internal)?
}
