mod commands;
mod error;
mod state;
mod types;

use commands::setup;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            setup::check_port,
            setup::check_bitcoin_core,
            setup::get_version_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
