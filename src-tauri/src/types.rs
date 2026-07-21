//! Serde DTOs crossing the IPC boundary. Mirrored by `src/api/types.ts`.
//! Conventions: camelCase field names, amounts in sats as u64.

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortStatus {
    pub reachable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcSettings {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreStatus {
    pub chain: String,
    pub blocks: u64,
    pub headers: u64,
    pub initial_block_download: bool,
    /// true when headers == blocks and IBD is over
    pub synced: bool,
    /// Core's version string, e.g. "/Satoshi:27.0.0/".
    pub subversion: String,
    /// [0..1] estimate of chain verification progress.
    pub verification_progress: f64,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionInfo {
    pub app_version: String,
    pub coinswap_source: String,
}

/// bootstrapProgress is informational only — init doesn't gate on it.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorStatus {
    pub reachable: bool,
    pub authenticated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bootstrap_progress: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionTypeDto {
    Tor,
    Clearnet,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitConfig {
    pub wallet_name: String,
    #[serde(default)]
    pub wallet_password: Option<String>,
    pub rpc: RpcSettings,
    pub zmq_addr: String,
    #[serde(default)]
    pub control_port: Option<u16>,
    #[serde(default)]
    pub socks_port: Option<u16>,
    #[serde(default)]
    pub tor_auth_password: Option<String>,
    pub connection_type: ConnectionTypeDto,
    #[serde(default)]
    pub data_dir: Option<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitResult {
    pub wallet_name: String,
    pub data_dir: String,
    /// True if the wallet has live (unfinished) contract UTXOs after init.
    pub recovery_pending: bool,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletInfo {
    pub wallet_name: String,
    pub wallet_path: String,
    pub data_dir: String,
}

// ---------------------------------------------------------------------------
// Wallet operations
// ---------------------------------------------------------------------------

/// Mirrors coinswap's `Balances` (all amounts in sats).
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalancesDto {
    pub regular: u64,
    pub swap: u64,
    pub contract: u64,
    pub fidelity: u64,
    pub spendable: u64,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwapLiquidity {
    pub spendable: u64,
    pub regular: u64,
    pub swap: u64,
    /// max(regular, swap) minus a dust buffer, matching the old app's rule.
    pub max_swappable: u64,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AddressTypeDto {
    P2wpkh,
    P2tr,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewAddress {
    pub address: String,
    pub address_type: String,
}

/// Condensed from `bitcoind::bitcoincore_rpc::json::ListTransactionResult`.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TxSummary {
    pub txid: String,
    pub category: String,
    /// Signed: negative for outgoing, positive for incoming.
    pub amount_sats: i64,
    pub confirmations: i32,
    pub address: Option<String>,
    pub time: u64,
    pub fee_sats: Option<i64>,
    /// Core's wallet label for the receiving output, e.g. "watchonly_swapcoin".
    pub label: Option<String>,
}

/// One UTXO plus its coinswap-specific spend-type classification.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UtxoEntry {
    pub txid: String,
    pub vout: u32,
    pub amount_sats: u64,
    pub confirmations: u32,
    pub address: Option<String>,
    pub spendable: bool,
    pub solvable: bool,
    /// Human category from coinswap's `UTXOSpendInfo` Display impl, e.g.
    /// "regular", "incoming swap", "outgoing swap", "timelock contract",
    /// "hashlock contract", "fidelity bond", "swept".
    pub spend_type: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Outpoint {
    pub txid: String,
    pub vout: u32,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendResult {
    pub txid: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeeEstimate {
    pub high: f64,
    pub mid: f64,
    pub low: f64,
}

// ---------------------------------------------------------------------------
// Market / offerbook
// ---------------------------------------------------------------------------

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfferDto {
    pub base_fee: u64,
    pub amount_relative_fee_pct: f64,
    pub time_relative_fee_pct: f64,
    pub required_confirms: u32,
    pub minimum_locktime: u16,
    pub max_size: u64,
    pub min_size: u64,
    pub bond_amount_sats: u64,
    /// Absolute block height the bond unlocks at.
    pub bond_locktime_height: u32,
    pub bond_txid: String,
    pub bond_vout: u32,
    pub bond_is_spent: bool,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MakerDto {
    pub address: String,
    /// "legacy" | "taproot" | null (protocol unknown until an offer is fetched)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub protocol: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offer: Option<OfferDto>,
    /// "good" | "bad" | "unresponsive"
    pub state: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfferBookView {
    pub good: Vec<MakerDto>,
    pub bad: Vec<MakerDto>,
    pub unresponsive: Vec<MakerDto>,
    pub syncing: bool,
    pub last_sync_ts: u64,
}

// ---------------------------------------------------------------------------
// Swap
// ---------------------------------------------------------------------------

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProtocolVersionDto {
    Legacy,
    Taproot,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwapRequest {
    pub protocol: ProtocolVersionDto,
    pub amount_sats: u64,
    pub maker_count: usize,
    #[serde(default)]
    pub outpoints: Option<Vec<Outpoint>>,
    #[serde(default)]
    pub preferred_makers: Option<Vec<String>>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MakerFeeInfoDto {
    pub address: String,
    pub protocol: String,
    pub base_fee: u64,
    pub amount_relative_fee_pct: f64,
    pub time_relative_fee_pct: f64,
    pub locktime: u16,
    pub estimated_fee_sats: u64,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwapSummaryDto {
    pub swap_id: String,
    pub protocol: String,
    pub send_amount_sats: u64,
    pub makers: Vec<MakerFeeInfoDto>,
    pub total_estimated_fee_sats: u64,
    pub estimated_receive_amount_sats: u64,
}

/// Coarse lifecycle snapshot — no per-maker progress yet.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwapProgressDto {
    pub swap_id: String,
    /// "prepared" | "running" | "finished" | "failed"
    pub phase: String,
    pub started_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryStatus {
    pub recovering: bool,
    pub complete: bool,
    pub pending_contract_count: usize,
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwapReportSummary {
    pub swap_id: String,
    /// "success" | "recovery_hashlock" | "recovery_timelock" | "failed"
    pub status: String,
    pub start_timestamp: u64,
    pub end_timestamp: u64,
    pub outgoing_amount_sats: u64,
    pub incoming_amount_sats: u64,
    pub fee_paid_sats: u64,
    pub makers_count: usize,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwapReportDetail {
    pub swap_id: String,
    pub status: String,
    pub network: String,
    pub swap_duration_seconds: f64,
    pub start_timestamp: u64,
    pub end_timestamp: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    pub outgoing_amount_sats: u64,
    pub incoming_amount_sats: u64,
    pub fee_paid_sats: u64,
    pub mining_fee_sats: u64,
    pub fee_percentage: f64,
    pub total_maker_fees_sats: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outgoing_contract_txid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub incoming_contract_txid: Option<String>,
    pub funding_txids: Vec<Vec<String>>,
    pub makers_count: usize,
    pub maker_addresses: Vec<String>,
    pub has_deniability_proof: bool,
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub line: String,
}
