//! App-level error envelope. `TakerError` and `WalletError` are `Debug`-only
//! (no Display/Error/Serialize), so every crate error is converted here before
//! crossing the IPC boundary. The frontend switches on `code`; `message` is
//! raw debug output for logs and bug reports only.

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

// Full error surface for the whole app (docs/BACKEND.md §7); variants light up
// as their owning commands (wallet, market, swap) land — not dead code, just early.
#[allow(dead_code)]
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

    #[allow(dead_code)]
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
    // TODO(phase 2): classify variants (wrong password vs load failure vs
    // insufficient funds) once the exact variants are pinned down with tests.
    fn from(e: WalletError) -> Self {
        Self::new(ErrorCode::WalletLoadFailed, format!("{e:?}"))
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
