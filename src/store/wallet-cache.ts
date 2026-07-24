import { create } from "zustand";
import type { Balances, TxSummary, UtxoEntry, WalletInfo } from "../api/types";

// Survives WalletPage unmount/remount so revisits paint instantly. CACHE_TTL_MS caps how stale a
// snapshot can get (closing the window doesn't always quit the Tauri process on macOS).
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
