mod commands;
mod error;
mod state;
mod types;

use commands::{logs, market, reports, setup, swap, wallet};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            // setup / connectivity
            setup::check_port,
            setup::check_bitcoin_core,
            setup::check_tor,
            setup::get_version_info,
            // wallet lifecycle
            wallet::is_wallet_encrypted,
            wallet::list_wallets,
            wallet::init_taker,
            wallet::shutdown_taker,
            wallet::get_wallet_info,
            wallet::restore_wallet,
            wallet::backup_wallet,
            // wallet operations
            wallet::get_balances,
            wallet::check_swap_liquidity,
            wallet::get_new_address,
            wallet::get_transactions,
            wallet::list_utxos,
            wallet::send_to_address,
            wallet::sync_wallet,
            wallet::estimate_fees,
            wallet::get_btc_price,
            // market / offerbook
            market::get_offers,
            market::sync_offerbook,
            market::poll_maker,
            market::remove_maker,
            // swap
            swap::prepare_swap,
            swap::start_swap,
            swap::get_swap_progress,
            swap::recover_swap,
            swap::get_recovery_status,
            // reports
            reports::list_swap_reports,
            reports::get_swap_report,
            reports::verify_deniability,
            // logs
            logs::get_logs,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state: tauri::State<state::AppState> = window.state();
                // Drop for Taker flushes offerbook/wallet state and stops
                // background threads. Best-effort: the app is closing either way.
                let _ = wallet::shutdown(&state);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
