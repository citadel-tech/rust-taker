// Mirrors src-tauri/src/types.rs (camelCase, sats as numbers).

export interface PortStatus {
  reachable: boolean;
  error?: string;
}

export interface RpcSettings {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface CoreStatus {
  chain: string;
  blocks: number;
  headers: number;
  initialBlockDownload: boolean;
  synced: boolean;
}

export interface VersionInfo {
  appVersion: string;
  coinswapSource: string;
}

// Mirrors src-tauri/src/error.rs — every failed invoke() rejects with this.
export interface AppError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export type ErrorCode =
  | "RPC_UNREACHABLE"
  | "RPC_AUTH_FAILED"
  | "TOR_UNREACHABLE"
  | "ZMQ_UNREACHABLE"
  | "WALLET_NOT_FOUND"
  | "WALLET_WRONG_PASSWORD"
  | "WALLET_LOAD_FAILED"
  | "NOT_INITIALIZED"
  | "SWAP_IN_PROGRESS"
  | "INSUFFICIENT_FUNDS"
  | "NOT_ENOUGH_MAKERS"
  | "CONTRACTS_BROADCASTED"
  | "INVALID_INPUT"
  | "STATE_POISONED"
  | "IO"
  | "INTERNAL";
