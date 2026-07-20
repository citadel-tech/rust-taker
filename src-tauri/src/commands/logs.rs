//! Tail of `<data_dir>/debug.log`, written by the crate's own `log4rs`
//! logger (installed once, in `init_taker` — see `commands::wallet`). Empty
//! until a taker session has been initialized at least once.

use crate::error::AppError;
use crate::state::AppState;
use crate::types::LogLine;

#[tauri::command]
pub async fn get_logs(
    state: tauri::State<'_, AppState>,
    lines: Option<usize>,
) -> Result<Vec<LogLine>, AppError> {
    let data_dir = state
        .data_dir
        .read()?
        .clone()
        .ok_or_else(AppError::not_initialized)?;
    let path = data_dir.join("debug.log");
    let want = lines.unwrap_or(100);

    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<LogLine>, AppError> {
        if !path.exists() {
            return Ok(vec![]);
        }
        let contents = std::fs::read_to_string(&path)?;
        let all: Vec<&str> = contents.lines().collect();
        let start = all.len().saturating_sub(want);
        Ok(all[start..]
            .iter()
            .map(|l| LogLine {
                line: l.to_string(),
            })
            .collect())
    })
    .await
    .map_err(AppError::internal)?
}
