import { create } from "zustand";
import type { InitResult } from "../api/types";

interface SessionState {
  initialized: boolean;
  walletName: string | null;
  dataDir: string | null;
  recoveryPending: boolean;
  setInitialized: (result: InitResult) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  initialized: false,
  walletName: null,
  dataDir: null,
  recoveryPending: false,
  setInitialized: (result) =>
    set({
      initialized: true,
      walletName: result.walletName,
      dataDir: result.dataDir,
      recoveryPending: result.recoveryPending,
    }),
  reset: () =>
    set({ initialized: false, walletName: null, dataDir: null, recoveryPending: false }),
}));
