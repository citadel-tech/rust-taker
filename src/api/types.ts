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
  subversion: string;
  verificationProgress: number;
}

export interface VersionInfo {
  appVersion: string;
  coinswapSource: string;
}

// bootstrapProgress is informational only — coinswap's own init doesn't gate on it.
export interface TorStatus {
  reachable: boolean;
  authenticated: boolean;
  bootstrapProgress?: number;
  error?: string;
}

export type ConnectionType = "tor" | "clearnet";

export interface InitConfig {
  walletName: string;
  walletPassword?: string;
  rpc: RpcSettings;
  zmqAddr: string;
  controlPort?: number;
  socksPort?: number;
  torAuthPassword?: string;
  connectionType: ConnectionType;
  dataDir?: string;
}

export interface InitResult {
  walletName: string;
  dataDir: string;
  recoveryPending: boolean;
}

export interface WalletInfo {
  walletName: string;
  walletPath: string;
  dataDir: string;
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

// ---------------------------------------------------------------------------
// Wallet operations
// ---------------------------------------------------------------------------

export interface Balances {
  regular: number;
  swap: number;
  contract: number;
  fidelity: number;
  spendable: number;
}

export interface SwapLiquidity {
  spendable: number;
  regular: number;
  swap: number;
  maxSwappable: number;
}

export type AddressType = "p2wpkh" | "p2tr";

export interface NewAddress {
  address: string;
  addressType: string;
}

export interface TxSummary {
  txid: string;
  category: string;
  amountSats: number;
  confirmations: number;
  address?: string;
  time: number;
  feeSats?: number;
  label?: string;
}

export interface UtxoEntry {
  txid: string;
  vout: number;
  amountSats: number;
  confirmations: number;
  address?: string;
  spendable: boolean;
  solvable: boolean;
  spendType: string;
}

export interface Outpoint {
  txid: string;
  vout: number;
}

export interface SendResult {
  txid: string;
}

export interface FeeEstimate {
  high: number;
  mid: number;
  low: number;
}

// ---------------------------------------------------------------------------
// Market / offerbook
// ---------------------------------------------------------------------------

export interface Offer {
  baseFee: number;
  amountRelativeFeePct: number;
  timeRelativeFeePct: number;
  requiredConfirms: number;
  minimumLocktime: number;
  maxSize: number;
  minSize: number;
  bondAmountSats: number;
  bondLocktimeHeight: number;
  bondTxid: string;
  bondVout: number;
  bondIsSpent: boolean;
}

export interface Maker {
  address: string;
  protocol?: string;
  offer?: Offer;
  state: "good" | "bad" | "unresponsive";
}

export interface OfferBookView {
  good: Maker[];
  bad: Maker[];
  unresponsive: Maker[];
  syncing: boolean;
  lastSyncTs: number;
}

// ---------------------------------------------------------------------------
// Swap
// ---------------------------------------------------------------------------

export type ProtocolVersion = "legacy" | "taproot";

export interface SwapRequest {
  protocol: ProtocolVersion;
  amountSats: number;
  makerCount: number;
  outpoints?: Outpoint[];
  preferredMakers?: string[];
}

export interface MakerFeeInfo {
  address: string;
  protocol: string;
  baseFee: number;
  amountRelativeFeePct: number;
  timeRelativeFeePct: number;
  locktime: number;
  estimatedFeeSats: number;
}

export interface SwapSummary {
  swapId: string;
  protocol: string;
  sendAmountSats: number;
  makers: MakerFeeInfo[];
  totalEstimatedFeeSats: number;
  estimatedReceiveAmountSats: number;
}

// Coarse lifecycle only — see src-tauri/src/commands/swap.rs's module doc
// for why per-maker live progress isn't available yet.
export type SwapPhase = "prepared" | "running" | "recovering" | "finished" | "failed";

export interface SwapProgress {
  swapId: string;
  phase: SwapPhase;
  startedAt?: number;
  error?: string;
}

export interface RecoveryStatus {
  recovering: boolean;
  complete: boolean;
  pendingContractCount: number;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type SwapStatus = "success" | "recovery_hashlock" | "recovery_timelock" | "failed";

export interface SwapReportSummary {
  swapId: string;
  status: SwapStatus;
  startTimestamp: number;
  endTimestamp: number;
  outgoingAmountSats: number;
  incomingAmountSats: number;
  feePaidSats: number;
  makersCount: number;
}

export interface SwapReportDetail {
  swapId: string;
  status: SwapStatus;
  network: string;
  swapDurationSeconds: number;
  startTimestamp: number;
  endTimestamp: number;
  errorMessage?: string;
  outgoingAmountSats: number;
  incomingAmountSats: number;
  feePaidSats: number;
  miningFeeSats: number;
  feePercentage: number;
  totalMakerFeesSats: number;
  outgoingContractTxid?: string;
  incomingContractTxid?: string;
  fundingTxids: string[][];
  makersCount: number;
  makerAddresses: string[];
  hasDeniabilityProof: boolean;
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

export interface LogLine {
  line: string;
}
