import { create } from "zustand";
import type { Balances, TxSummary, UtxoEntry, WalletInfo } from "../api/types";

// Persists across WalletPage unmount/remount (navigating to Market/Settings
// and back) so re-visiting the tab paints instantly from the last known data
// instead of blanking out while a fresh sync+load runs in the background.
//
// Explicitly NOT meant to persist indefinitely: on macOS, closing the window
// doesn't necessarily quit the Tauri process, so without a TTL this would go
// on serving a snapshot from arbitrarily long ago after real swaps/sends have
// since changed the actual balances/UTXOs. CACHE_TTL_MS bounds how long a
// snapshot is trusted before a revisit forces the full loading screen again;
// REFRESH_INTERVAL_MS is how often WalletPage silently re-syncs while mounted
// so the cache normally never gets that old during active use.
export const CACHE_TTL_MS = 10 * 60 * 1000;
export const REFRESH_INTERVAL_MS = 2 * 60 * 1000;

interface WalletCacheState {
  info: WalletInfo | null;
  balances: Balances | null;
  utxos: UtxoEntry[];
  transactions: TxSummary[];
  lastUpdated: string;
  updatedAt: number | null;
  setData: (data: { info: WalletInfo; balances: Balances; utxos: UtxoEntry[]; transactions: TxSummary[] }) => void;
  setLastUpdated: (lastUpdated: string) => void;
}

export const useWalletCacheStore = create<WalletCacheState>((set) => ({
  info: null,
  balances: null,
  utxos: [],
  transactions: [],
  lastUpdated: "Just now",
  updatedAt: null,
  setData: (data) => set({ ...data, updatedAt: Date.now() }),
  setLastUpdated: (lastUpdated) => set({ lastUpdated }),
}));

export function isCacheStale(updatedAt: number | null): boolean {
  return updatedAt === null || Date.now() - updatedAt > CACHE_TTL_MS;
}
