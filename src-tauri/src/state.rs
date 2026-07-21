use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::{Arc, Mutex, MutexGuard, RwLock, TryLockError};
use std::time::SystemTime;

use coinswap::taker::offers::OfferSyncClient;
use coinswap::taker::Taker;
use coinswap::wallet::Wallet;

use crate::error::AppError;

/// Non-blocking taker lock — fails fast with SwapInProgress instead of
/// blocking for however long a running swap holds the mutex.
pub fn try_lock_taker(
    taker: &Mutex<Option<Taker>>,
) -> Result<MutexGuard<'_, Option<Taker>>, AppError> {
    match taker.try_lock() {
        Ok(guard) => Ok(guard),
        Err(TryLockError::WouldBlock) => Err(AppError::swap_in_progress()),
        Err(TryLockError::Poisoned(poisoned)) => Ok(poisoned.into_inner()),
    }
}

#[derive(Default)]
pub struct AppState {
    /// The Taker. `None` until the setup wizard completes `init_taker`.
    pub taker: Arc<Mutex<Option<Taker>>>,
    /// Cached from `taker.get_wallet()` at init.
    pub wallet: RwLock<Option<Arc<RwLock<Wallet>>>>,
    /// Cached from `taker.offer_sync_client()` at init.
    pub offer_sync: RwLock<Option<OfferSyncClient>>,
    /// Set at `init_taker`; not exposed by `Taker` itself.
    pub data_dir: RwLock<Option<PathBuf>>,
    /// Single active swap slot; one swap at a time by design.
    pub active_swap: Mutex<Option<ActiveSwap>>,
    /// Own bookkeeping for syncs we trigger — the crate doesn't expose this
    /// on the public OfferSyncClient.
    pub is_offerbook_syncing: AtomicBool,
    pub last_offerbook_sync_ts: AtomicU64,
}

pub struct ActiveSwap {
    pub swap_id: String,
    pub phase: SwapLifecycle,
    pub started_at: Option<SystemTime>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SwapLifecycle {
    Prepared,
    Running,
    Recovering,
    Finished,
    Failed,
}
