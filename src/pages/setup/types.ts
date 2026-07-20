import { homeDir, join } from "@tauri-apps/api/path";

export interface ConnectivityConfig {
  rpcPort: number;
  rpcUsername: string;
  rpcPassword: string;
  zmqPort: number;
  torControlPort: number;
  torSocksPort: number;
  torAuthPassword: string;
}

export type WalletChoice =
  | { mode: "create"; walletName: string; password: string }
  | { mode: "load"; walletName: string; password?: string }
  | { mode: "restore"; walletName: string; backupFilePath: string; password?: string };

// Matches taker-app/src/components/settings/FirstTimeSetup.js's exact defaults.
// Host is fixed to 127.0.0.1 there too (a hidden field, never user-editable).
export const RPC_HOST = "127.0.0.1";

export const HARDCODED_DEFAULTS: ConnectivityConfig = {
  rpcPort: 38332,
  rpcUsername: "user",
  rpcPassword: "password",
  zmqPort: 28332,
  torControlPort: 9051,
  torSocksPort: 9050,
  torAuthPassword: "",
};

const STORAGE_KEY = "coinswap_connectivity_defaults";

export function loadConnectivityDefaults(): ConnectivityConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return HARDCODED_DEFAULTS;
    return { ...HARDCODED_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return HARDCODED_DEFAULTS;
  }
}

export function saveConnectivityDefaults(config: ConnectivityConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

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
