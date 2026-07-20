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
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionInfo {
    pub app_version: String,
    pub coinswap_source: String,
}
