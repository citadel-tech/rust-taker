import { invoke } from "@tauri-apps/api/core";
import type {
  AddressType,
  Balances,
  CoreStatus,
  FeeEstimate,
  InitConfig,
  InitResult,
  LogLine,
  Maker,
  NewAddress,
  OfferBookView,
  Outpoint,
  PortStatus,
  RecoveryStatus,
  RpcSettings,
  SendResult,
  SwapLiquidity,
  SwapProgress,
  SwapReportDetail,
  SwapReportSummary,
  SwapRequest,
  SwapSummary,
  TorStatus,
  TxSummary,
  UtxoEntry,
  VersionInfo,
  WalletInfo,
} from "./types";

export function checkPort(
  host: string,
  port: number,
  timeoutMs?: number,
): Promise<PortStatus> {
  return invoke("check_port", { host, port, timeoutMs });
}

export function checkBitcoinCore(rpc: RpcSettings): Promise<CoreStatus> {
  return invoke("check_bitcoin_core", { rpc });
}

export function checkTor(
  controlPort: number,
  torAuthPassword: string,
): Promise<TorStatus> {
  return invoke("check_tor", { controlPort, torAuthPassword });
}

export function getVersionInfo(): Promise<VersionInfo> {
  return invoke("get_version_info");
}

export function isWalletEncrypted(
  walletName: string,
  dataDir?: string,
): Promise<boolean> {
  return invoke("is_wallet_encrypted", { dataDir, walletName });
}

export function listWallets(dataDir?: string): Promise<string[]> {
  return invoke("list_wallets", { dataDir });
}

export function initTaker(config: InitConfig): Promise<InitResult> {
  return invoke("init_taker", { config });
}

export function shutdownTaker(): Promise<void> {
  return invoke("shutdown_taker");
}

export function getWalletInfo(): Promise<WalletInfo> {
  return invoke("get_wallet_info");
}

export function restoreWallet(
  walletName: string,
  rpc: RpcSettings,
  backupFilePath: string,
  password?: string,
  dataDir?: string,
): Promise<void> {
  return invoke("restore_wallet", {
    dataDir,
    walletName,
    rpc,
    backupFilePath,
    password,
  });
}

export function backupWallet(
  destinationPath: string,
  password?: string,
): Promise<void> {
  return invoke("backup_wallet", { destinationPath, password });
}

// ---------------------------------------------------------------------------
// Wallet operations
// ---------------------------------------------------------------------------

export function getBalances(): Promise<Balances> {
  return invoke("get_balances");
}

export function checkSwapLiquidity(): Promise<SwapLiquidity> {
  return invoke("check_swap_liquidity");
}

export function getNewAddress(addressType: AddressType): Promise<NewAddress> {
  return invoke("get_new_address", { addressType });
}

export function getTransactions(
  count?: number,
  skip?: number,
): Promise<TxSummary[]> {
  return invoke("get_transactions", { count, skip });
}

export function listUtxos(): Promise<UtxoEntry[]> {
  return invoke("list_utxos");
}

export function sendToAddress(
  address: string,
  amountSats: number,
  feeRate?: number,
  outpoints?: Outpoint[],
): Promise<SendResult> {
  return invoke("send_to_address", { address, amountSats, feeRate, outpoints });
}

export function syncWallet(): Promise<void> {
  return invoke("sync_wallet");
}

export function estimateFees(): Promise<FeeEstimate> {
  return invoke("estimate_fees");
}

// ---------------------------------------------------------------------------
// Market / offerbook
// ---------------------------------------------------------------------------

export function getOffers(): Promise<OfferBookView> {
  return invoke("get_offers");
}

export function syncOfferbook(): Promise<void> {
  return invoke("sync_offerbook");
}

export function pollMaker(address: string): Promise<Maker> {
  return invoke("poll_maker", { address });
}

export function removeMaker(address: string): Promise<boolean> {
  return invoke("remove_maker", { address });
}

// ---------------------------------------------------------------------------
// Swap
// ---------------------------------------------------------------------------

export function prepareSwap(request: SwapRequest): Promise<SwapSummary> {
  return invoke("prepare_swap", { request });
}

// Result arrives via the "swap://finished" / "swap://failed" events (see
// src-tauri/src/commands/swap.rs); poll getSwapProgress for a snapshot.
export function startSwap(swapId: string): Promise<void> {
  return invoke("start_swap", { swapId });
}

export function getSwapProgress(): Promise<SwapProgress | null> {
  return invoke("get_swap_progress");
}

export function recoverSwap(): Promise<void> {
  return invoke("recover_swap");
}

export function getRecoveryStatus(): Promise<RecoveryStatus> {
  return invoke("get_recovery_status");
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export function listSwapReports(): Promise<SwapReportSummary[]> {
  return invoke("list_swap_reports");
}

export function getSwapReport(swapId: string): Promise<SwapReportDetail> {
  return invoke("get_swap_report", { swapId });
}

export function verifyDeniability(swapId: string): Promise<boolean> {
  return invoke("verify_deniability", { swapId });
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

export function getLogs(lines?: number): Promise<LogLine[]> {
  return invoke("get_logs", { lines });
}
