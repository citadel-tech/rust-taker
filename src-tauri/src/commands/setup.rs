//! Setup & connectivity commands: wizard prechecks and version info.
//! All blocking I/O runs via `spawn_blocking` — never on the async runtime.

use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

use coinswap::bitcoind::bitcoincore_rpc::{Auth, Client, RpcApi};

use crate::error::{AppError, ErrorCode};
use crate::types::{CoreStatus, PortStatus, RpcSettings, VersionInfo};

/// Raw TCP reachability probe (RPC / ZMQ / Tor SOCKS / Tor control ports).
#[tauri::command]
pub async fn check_port(
    host: String,
    port: u16,
    timeout_ms: Option<u64>,
) -> Result<PortStatus, AppError> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(3000));
    tauri::async_runtime::spawn_blocking(move || {
        let addr = match (host.as_str(), port).to_socket_addrs() {
            Ok(mut addrs) => match addrs.next() {
                Some(a) => a,
                None => {
                    return PortStatus {
                        reachable: false,
                        error: Some(format!("could not resolve {host}:{port}")),
                    }
                }
            },
            Err(e) => {
                return PortStatus {
                    reachable: false,
                    error: Some(e.to_string()),
                }
            }
        };
        match TcpStream::connect_timeout(&addr, timeout) {
            Ok(_) => PortStatus {
                reachable: true,
                error: None,
            },
            Err(e) => PortStatus {
                reachable: false,
                error: Some(e.to_string()),
            },
        }
    })
    .await
    .map_err(AppError::internal)
}

/// Bitcoin Core precheck: connect over RPC and report chain/sync status.
#[tauri::command]
pub async fn check_bitcoin_core(rpc: RpcSettings) -> Result<CoreStatus, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let url = format!("http://{}:{}", rpc.host, rpc.port);
        let client = Client::new(&url, Auth::UserPass(rpc.username, rpc.password))
            .map_err(|e| AppError::new(ErrorCode::RpcUnreachable, format!("{e:?}")))?;
        let info = client.get_blockchain_info().map_err(|e| {
            let msg = format!("{e:?}");
            let code = if msg.contains("401") || msg.to_lowercase().contains("auth") {
                ErrorCode::RpcAuthFailed
            } else {
                ErrorCode::RpcUnreachable
            };
            AppError::new(code, msg)
        })?;
        Ok(CoreStatus {
            chain: info.chain.to_string(),
            blocks: info.blocks,
            headers: info.headers,
            initial_block_download: info.initial_block_download,
            synced: !info.initial_block_download && info.blocks == info.headers,
        })
    })
    .await
    .map_err(AppError::internal)?
}

#[tauri::command]
pub fn get_version_info(app: tauri::AppHandle) -> VersionInfo {
    VersionInfo {
        app_version: app.package_info().version.to_string(),
        // Path dependency for now; becomes a pinned git rev for releases.
        coinswap_source: "local path (../../coinswap)".to_string(),
    }
}
