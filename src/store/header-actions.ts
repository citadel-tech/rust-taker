import { create } from "zustand";

// Lets the active page (e.g. Wallet) wire its own refresh logic into the
// top nav's single Refresh icon, since AppShell doesn't know page internals.
interface HeaderActionsState {
  refreshing: boolean;
  onRefresh: (() => void) | null;
  register: (onRefresh: (() => void) | null) => void;
  setRefreshing: (refreshing: boolean) => void;
}

export const useHeaderActionsStore = create<HeaderActionsState>((set) => ({
  refreshing: false,
  onRefresh: null,
  register: (onRefresh) => set({ onRefresh }),
  setRefreshing: (refreshing) => set({ refreshing }),
}));
