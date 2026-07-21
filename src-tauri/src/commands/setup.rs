//! Setup & connectivity commands: wizard prechecks and version info.
//! All blocking I/O runs via `spawn_blocking` — never on the async runtime.
//! Wallet lifecycle (init/restore/backup) lives in `commands::wallet`.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

use coinswap::bitcoind::bitcoincore_rpc::{Auth, Client, RpcApi};

use crate::error::{AppError, ErrorCode};
use crate::types::{CoreStatus, PortStatus, RpcSettings, TorStatus, VersionInfo};

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
        let subversion = client
            .get_network_info()
            .map(|n| n.subversion)
            .unwrap_or_default();
        Ok(CoreStatus {
            chain: info.chain.to_string(),
            blocks: info.blocks,
            headers: info.headers,
            initial_block_download: info.initial_block_download,
            synced: !info.initial_block_download && info.blocks == info.headers,
            subversion,
            verification_progress: info.verification_progress,
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

/// Mirrors coinswap's own control-port handshake. Bootstrap < 100% is
/// informational only, not a failure.
#[tauri::command]
pub async fn check_tor(control_port: u16, tor_auth_password: String) -> Result<TorStatus, AppError> {
    tauri::async_runtime::spawn_blocking(move || run_tor_handshake(control_port, &tor_auth_password))
        .await
        .map_err(AppError::internal)
}

fn run_tor_handshake(control_port: u16, password: &str) -> TorStatus {
    let unreachable = |err: String| TorStatus {
        reachable: false,
        authenticated: false,
        bootstrap_progress: None,
        error: Some(err),
    };

    let addr = match format!("127.0.0.1:{control_port}").to_socket_addrs() {
        Ok(mut addrs) => match addrs.next() {
            Some(a) => a,
            None => return unreachable("could not resolve control port address".into()),
        },
        Err(e) => return unreachable(e.to_string()),
    };

    let mut stream = match TcpStream::connect_timeout(&addr, Duration::from_secs(5)) {
        Ok(s) => s,
        Err(e) => return unreachable(e.to_string()),
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));

    let mut reader = match stream.try_clone() {
        Ok(s) => BufReader::new(s),
        Err(e) => return unreachable(e.to_string()),
    };

    if stream
        .write_all(format!("AUTHENTICATE \"{password}\"\r\n").as_bytes())
        .is_err()
    {
        return unreachable("failed to send AUTHENTICATE".into());
    }
    let mut resp = String::new();
    if reader.read_line(&mut resp).is_err() || !resp.starts_with("250") {
        return TorStatus {
            reachable: true,
            authenticated: false,
            bootstrap_progress: None,
            error: Some("Tor control-port authentication failed".into()),
        };
    }

    if stream.write_all(b"GETINFO status/bootstrap-phase\r\n").is_err() {
        return TorStatus {
            reachable: true,
            authenticated: true,
            bootstrap_progress: None,
            error: None,
        };
    }
    resp.clear();
    let _ = reader.read_line(&mut resp);
    let bootstrap_progress = resp
        .split("PROGRESS=")
        .nth(1)
        .and_then(|s| s.split(|c: char| !c.is_ascii_digit()).next())
        .and_then(|s| s.parse::<u8>().ok());

    TorStatus {
        reachable: true,
        authenticated: true,
        bootstrap_progress,
        error: None,
    }
}
