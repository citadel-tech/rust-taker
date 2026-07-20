//! Shared backend state. Threading rules (docs/BACKEND.md §5):
//! - `taker` is locked for the entire duration of a running swap; commands
//!   use `try_lock` and fail fast with SwapInProgress instead of queueing.
//! - `wallet` and `offer_sync` are cached clones taken at init so wallet
//!   reads and offerbook syncs never contend with the taker mutex.

#![allow(dead_code)] // consumed incrementally as command modules land

use std::sync::{Arc, Mutex, RwLock};
use std::time::SystemTime;

use coinswap::taker::offers::OfferSyncClient;
use coinswap::taker::Taker;
use coinswap::wallet::Wallet;

#[derive(Default)]
pub struct AppState {
    /// The Taker. `None` until the setup wizard completes `init_taker`.
    pub taker: Arc<Mutex<Option<Taker>>>,
    /// Cached from `taker.get_wallet()` at init.
    pub wallet: RwLock<Option<Arc<RwLock<Wallet>>>>,
    /// Cached from `taker.offer_sync_client()` at init.
    pub offer_sync: RwLock<Option<OfferSyncClient>>,
    /// Single active swap slot; one swap at a time by design.
    pub active_swap: Mutex<Option<ActiveSwap>>,
}

pub struct ActiveSwap {
    pub swap_id: String,
    pub phase: SwapLifecycle,
    pub started_at: Option<SystemTime>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SwapLifecycle {
    Prepared,
    Running,
    Recovering,
    Finished,
    Failed,
}
