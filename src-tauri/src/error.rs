//! App-level error envelope. Crate errors are `Debug`-only, so everything is
//! converted here before crossing IPC. Frontend switches on `code`.

use coinswap::taker::error::TakerError;
use coinswap::wallet::WalletError;

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

#[allow(dead_code)] // full app-wide error surface; some variants not wired up yet
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    // setup / preflight
    RpcUnreachable,
    RpcAuthFailed,
    TorUnreachable,
    ZmqUnreachable,
    WalletNotFound,
    WalletWrongPassword,
    WalletLoadFailed,
    // runtime
    NotInitialized,
    SwapInProgress,
    InsufficientFunds,
    NotEnoughMakers,
    ContractsBroadcasted,
    InvalidInput,
    // infrastructure
    StatePoisoned,
    Io,
    Internal,
}

impl AppError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            details: None,
        }
    }

    pub fn internal(e: impl std::fmt::Debug) -> Self {
        Self::new(ErrorCode::Internal, format!("{e:?}"))
    }

    pub fn not_initialized() -> Self {
        Self::new(ErrorCode::NotInitialized, "taker is not initialized")
    }

    #[allow(dead_code)]
    pub fn swap_in_progress() -> Self {
        Self::new(ErrorCode::SwapInProgress, "a swap is currently running")
    }
}

impl From<TakerError> for AppError {
    fn from(e: TakerError) -> Self {
        let code = match &e {
            TakerError::ContractsBroadcasted(_) => ErrorCode::ContractsBroadcasted,
            TakerError::NotEnoughMakersInOfferBook => ErrorCode::NotEnoughMakers,
            TakerError::Wallet(_) => ErrorCode::WalletLoadFailed,
            TakerError::IO(_) => ErrorCode::Io,
            _ => ErrorCode::Internal,
        };
        let details = match &e {
            TakerError::ContractsBroadcasted(txids) => serde_json::to_value(
                txids.iter().map(|t| t.to_string()).collect::<Vec<_>>(),
            )
            .ok(),
            _ => None,
        };
        Self {
            code,
            message: format!("{e:?}"),
            details,
        }
    }
}

impl From<WalletError> for AppError {
    // Wrong password never reaches this — see from_wallet_join_error below.
    fn from(e: WalletError) -> Self {
        let code = match &e {
            WalletError::InsufficientFund { .. } => ErrorCode::InsufficientFunds,
            WalletError::InvalidAddress(_) => ErrorCode::InvalidInput,
            WalletError::IO(_) => ErrorCode::Io,
            _ => ErrorCode::WalletLoadFailed,
        };
        let details = match &e {
            WalletError::InsufficientFund { available, required } => {
                serde_json::json!({ "available": available, "required": required }).into()
            }
            _ => None,
        };
        Self {
            code,
            message: format!("{e:?}"),
            details,
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::new(ErrorCode::Io, format!("{e:?}"))
    }
}

impl<T> From<std::sync::PoisonError<T>> for AppError {
    fn from(e: std::sync::PoisonError<T>) -> Self {
        Self::new(ErrorCode::StatePoisoned, format!("{e}"))
    }
}

/// Coinswap panics (not Result::Err) on a wrong wallet password or corrupt
/// wallet file. spawn_blocking catches it as a JoinError; this classifies
/// the panic message into a proper ErrorCode instead of a generic Internal.
/// Always route wallet load/restore through spawn_blocking + this fn.
pub fn from_wallet_join_error(e: tauri::Error) -> AppError {
    let tauri::Error::JoinError(join_err) = e else {
        return AppError::internal(e);
    };
    if !join_err.is_panic() {
        return AppError::new(ErrorCode::Internal, "wallet task was cancelled".to_string());
    }
    let payload = join_err.into_panic();
    let msg = payload
        .downcast_ref::<&str>()
        .map(|s| s.to_string())
        .or_else(|| payload.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "wallet operation panicked".to_string());

    let code = if msg.contains("Failed to decrypt") {
        ErrorCode::WalletWrongPassword
    } else if msg.contains("Failed to read the file") {
        ErrorCode::WalletNotFound
    } else {
        // e.g. "Failed to deserialize file ...": corrupt/foreign wallet file.
        ErrorCode::WalletLoadFailed
    };
    AppError::new(code, msg)
}
