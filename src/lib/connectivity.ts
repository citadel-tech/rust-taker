// Shared RPC/Tor connectivity config — edited during first-run setup
// (pages/setup) and again later from Settings, so both read/write the same
// persisted defaults instead of drifting apart.

export interface ConnectivityConfig {
  rpcPort: number;
  rpcUsername: string;
  rpcPassword: string;
  zmqPort: number;
  torControlPort: number;
  torSocksPort: number;
  torAuthPassword: string;
}

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
