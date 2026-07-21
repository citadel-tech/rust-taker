import { homeDir, join } from "@tauri-apps/api/path";

export type WalletChoice =
  | { mode: "create"; walletName: string; password: string }
  | { mode: "load"; walletName: string; password?: string }
  | { mode: "restore"; walletName: string; backupFilePath: string; password?: string };

// Matches coinswap::utill::get_taker_dir() — get_home_dir().join(".coinswap").join("taker").
export async function getDefaultDataDir(): Promise<string> {
  return join(await homeDir(), ".coinswap", "taker");
}

// Wallet files live under <data_dir>/wallets/ (see src-tauri's wallet_path() helper).
// The dialog plugin needs a real resolved path here, not a "~/..." string — the native
// file picker has no shell to expand tildes.
export async function getDefaultWalletsDir(): Promise<string> {
  return join(await getDefaultDataDir(), "wallets");
}

const DATA_DIR_KEY = "coinswap_data_dir";

/** User-chosen data dir override ("Change location"), or undefined to use
 * the backend's own default (~/.coinswap/taker). */
export function loadDataDir(): string | undefined {
  return localStorage.getItem(DATA_DIR_KEY) ?? undefined;
}

export function saveDataDir(dir: string) {
  localStorage.setItem(DATA_DIR_KEY, dir);
}
