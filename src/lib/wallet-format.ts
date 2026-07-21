// Ported from taker-app/src/js/coinswapHelpers.js so the new dashboard
// classifies UTXOs/transactions exactly like the shipped app did.

export function truncateMiddle(value: string, start = 12, end = 8): string {
  if (!value || value.length <= start + end + 1) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

export function formatRelativeTime(timestampSeconds: number): string {
  const diffMs = Date.now() - timestampSeconds * 1000;
  if (diffMs < 0) return "Just now";
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hr ago`;
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(timestampSeconds * 1000).toLocaleDateString();
}

export type UtxoBucket = "Regular" | "Swap" | "Contract" | "Fidelity";

export function classifySpendType(spendType: string): UtxoBucket {
  const normalized = spendType.toLowerCase();
  if (normalized.includes("swap")) return "Swap";
  if (normalized.includes("contract")) return "Contract";
  if (normalized.includes("fidelity")) return "Fidelity";
  return "Regular";
}

/** Address-prefix based, mirroring the old app's detectAddressType. */
export function scriptTypeFromAddress(address: string | undefined): "Taproot" | "SegWit" {
  const bech32 = address?.match(/^(bc|tb|bcrt)1([a-z0-9]+)$/i);
  if (bech32?.[2][0].toLowerCase() === "p") return "Taproot";
  return "SegWit";
}

export type TxKind = "received" | "sent" | "swap";

export function getTransactionKind(category: string, label: string | undefined, amountSats: number): TxKind {
  const haystack = `${category} ${label ?? ""}`.toLowerCase();
  if (haystack.includes("swap") || haystack.includes("contract") || haystack.includes("htlc")) {
    return "swap";
  }
  return amountSats >= 0 ? "received" : "sent";
}

export const EXPLORER_BASE_URL = "https://mempool.citadelfoss.xyz";

export function explorerTxUrl(txid: string): string {
  return `${EXPLORER_BASE_URL}/tx/${encodeURIComponent(txid)}`;
}
