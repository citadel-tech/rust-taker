import { ArrowDownLeft, ArrowUpRight, ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getBalances, getTransactions, getWalletInfo, listUtxos, syncWallet } from "../../api/commands";
import type { Balances, TxSummary, UtxoEntry, WalletInfo } from "../../api/types";
import { SatsAmount } from "../../components/ui/display";
import {
  classifySpendType,
  explorerTxUrl,
  formatRelativeTime,
  getTransactionKind,
  scriptTypeFromAddress,
  truncateMiddle,
} from "../../lib/wallet-format";

type UtxoFilter = "all" | "regular" | "contract" | "swap";
type TxFilter = "all" | "received" | "sent" | "swap";
type TxSortKey = "newest" | "amount";
type SortDir = "asc" | "desc";

function BalanceCard({
  label,
  sats,
  caption,
  hero = false,
}: {
  label: string;
  sats: number;
  caption: string;
  hero?: boolean;
}) {
  return (
    <div
      className={`flex min-h-[150px] flex-col justify-between rounded-2xl border border-line p-5 ${
        hero
          ? "min-h-[170px] bg-gradient-to-r from-primary/20 to-primary/[0.03]"
          : "bg-surface"
      }`}
    >
      <span className="font-mono text-[10.5px] uppercase tracking-widest text-subtle">{label}</span>
      <SatsAmount
        sats={sats}
        className={hero ? "text-[46px] font-bold tracking-tight text-primary" : "text-[28px] font-bold text-foreground"}
      />
      <p className="text-[13px] text-muted">{caption}</p>
    </div>
  );
}

function TabGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-raised p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`min-h-[30px] whitespace-nowrap rounded-full px-3.5 text-[11.5px] font-medium transition-colors ${
            value === opt.value ? "bg-primary text-white" : "text-muted hover:text-foreground"
          }`}
        >
          {opt.label}
          {opt.count !== undefined && (
            <span className={`ml-1 font-mono text-[10px] ${value === opt.value ? "text-white/85" : "text-subtle"}`}>
              {opt.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function ExternalLinkButton({ txid }: { txid: string }) {
  return (
    <button
      type="button"
      title="View on explorer"
      onClick={(e) => {
        e.stopPropagation();
        void openUrl(explorerTxUrl(txid));
      }}
      className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-primary/60 hover:bg-primary/[0.14] hover:text-primary-hover"
    >
      <ExternalLink size={16} strokeWidth={1.8} />
    </button>
  );
}

const SCRIPT_PILL_CLASS: Record<string, string> = {
  Taproot: "text-[#b990ff] border-[#b990ff]/35 bg-[#b990ff]/10",
  SegWit: "text-primary border-primary/35 bg-primary/[0.12]",
};

const TYPE_PILL_CLASS: Record<string, string> = {
  Swap: "text-primary border-primary/35 bg-primary/[0.12]",
  Regular: "text-muted border-line bg-white/[0.03]",
  Contract: "text-warning border-warning/35 bg-warning/10",
  Fidelity: "text-warning border-warning/35 bg-warning/10",
};

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span className={`w-fit rounded-md border px-2 py-0.5 font-mono text-[9.5px] ${className}`}>{label}</span>
  );
}

export function WalletPage() {
  const [info, setInfo] = useState<WalletInfo | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [utxos, setUtxos] = useState<UtxoEntry[]>([]);
  const [transactions, setTransactions] = useState<TxSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("Just now");

  const [utxoFilter, setUtxoFilter] = useState<UtxoFilter>("all");
  const [txFilter, setTxFilter] = useState<TxFilter>("all");
  const [txSort, setTxSort] = useState<TxSortKey>("newest");
  const [sortDir, setSortDir] = useState<Record<TxSortKey, SortDir>>({ newest: "desc", amount: "desc" });

  const load = useCallback(async () => {
    const [nextInfo, nextBalances, nextUtxos, nextTx] = await Promise.all([
      getWalletInfo(),
      getBalances(),
      listUtxos(),
      getTransactions(50, 0),
    ]);
    setInfo(nextInfo);
    setBalances(nextBalances);
    setUtxos(nextUtxos);
    setTransactions(nextTx);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      try {
        await syncWallet();
      } catch {
        // Best-effort — stale data is still worth showing.
      }
      await load();
      setLastUpdated("Just now");
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  // The wallet's balance/UTXO/tx cache is only fresh after a sync, so the
  // initial mount needs the same sync-then-load sequence as the Refresh
  // button — a plain load() on mount reads stale/empty state.
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const utxoCounts = useMemo(() => {
    const counts = { all: utxos.length, regular: 0, contract: 0, swap: 0 };
    for (const u of utxos) {
      const bucket = classifySpendType(u.spendType);
      if (bucket === "Regular") counts.regular++;
      else if (bucket === "Contract" || bucket === "Fidelity") counts.contract++;
      else if (bucket === "Swap") counts.swap++;
    }
    return counts;
  }, [utxos]);

  const filteredUtxos = useMemo(() => {
    if (utxoFilter === "all") return utxos.slice(0, 7);
    return utxos
      .filter((u) => {
        const bucket = classifySpendType(u.spendType);
        if (utxoFilter === "regular") return bucket === "Regular";
        if (utxoFilter === "contract") return bucket === "Contract" || bucket === "Fidelity";
        return bucket === "Swap";
      })
      .slice(0, 7);
  }, [utxos, utxoFilter]);

  const filteredTx = useMemo(() => {
    let rows = txFilter === "all" ? transactions : transactions.filter((tx) => getTransactionKind(tx.category, tx.label, tx.amountSats) === txFilter);
    rows = [...rows];
    const dir = sortDir[txSort] === "asc" ? 1 : -1;
    if (txSort === "amount") {
      rows.sort((a, b) => (Math.abs(a.amountSats) - Math.abs(b.amountSats)) * dir);
    } else {
      rows.sort((a, b) => (a.time - b.time) * dir);
    }
    return rows.slice(0, 7);
  }, [transactions, txFilter, txSort, sortDir]);

  function toggleSort(key: TxSortKey) {
    if (key === txSort) {
      setSortDir((prev) => ({ ...prev, [key]: prev[key] === "desc" ? "asc" : "desc" }));
    } else {
      setTxSort(key);
    }
  }

  const totalBalance = (balances?.regular ?? 0) + (balances?.swap ?? 0);

  return (
    <div className="p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-bold leading-none tracking-tight text-foreground">Wallet</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 font-mono text-[10.5px] uppercase tracking-widest text-subtle">
            <span>{info?.walletName ?? "—"}</span>
            <span>.</span>
            <span>{info?.dataDir ?? ""}</span>
            <span>.</span>
            <span>Synced {lastUpdated.toLowerCase()}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[13px] font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          <RefreshCw size={15} strokeWidth={2} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing" : "Refresh"}
        </button>
      </header>

      <section className="mt-6 grid grid-cols-[minmax(320px,1.45fr)_repeat(3,minmax(210px,1fr))] gap-3">
        <BalanceCard label="Total Balance" sats={totalBalance} caption="Swap + Regular Coins" hero />
        <BalanceCard label="Swaps" sats={balances?.swap ?? 0} caption="Coins Received by swap txs" />
        <BalanceCard label="Regular" sats={balances?.regular ?? 0} caption="Coins Received by regular txs" />
        <BalanceCard label="Contracts" sats={balances?.contract ?? 0} caption="Coins stuck in HTLC" />
      </section>

      <section className="mt-3 grid grid-cols-[minmax(0,1.46fr)_minmax(410px,1fr)] gap-3">
        <article className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-line bg-surface">
          <header className="flex items-baseline gap-3 border-b border-line px-4.5 py-4">
            <h3 className="text-[15px] font-semibold text-foreground">UTXOs</h3>
            <span className="font-mono text-[10.5px] uppercase tracking-widest text-subtle">
              {utxoCounts.all} unspent
            </span>
          </header>
          <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3.5">
            <TabGroup
              value={utxoFilter}
              onChange={setUtxoFilter}
              options={[
                { value: "all", label: "All", count: utxoCounts.all },
                { value: "regular", label: "Regular", count: utxoCounts.regular },
                { value: "contract", label: "Contract", count: utxoCounts.contract },
                { value: "swap", label: "Swap", count: utxoCounts.swap },
              ]}
            />
            <div className="grid grid-cols-[1.35fr_0.58fr_0.58fr_1.1fr_52px] gap-3 px-3 font-mono text-[10px] uppercase tracking-widest text-subtle">
              <span>Txid . Amount</span>
              <span>Script</span>
              <span>Type</span>
              <span>Address</span>
              <span />
            </div>
            <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
              {filteredUtxos.length === 0 && (
                <p className="px-3 py-6 text-center text-[13px] text-subtle">No UTXOs match this filter.</p>
              )}
              {filteredUtxos.map((u) => {
                const bucket = classifySpendType(u.spendType);
                const script = scriptTypeFromAddress(u.address);
                return (
                  <div
                    key={`${u.txid}:${u.vout}`}
                    className="grid min-h-[58px] grid-cols-[1.35fr_0.58fr_0.58fr_1.1fr_52px] items-center gap-3 rounded-lg border border-line bg-surface-raised px-3 py-2.5"
                  >
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="truncate font-mono text-[12px] text-muted">
                        {truncateMiddle(u.txid, 12, 4)}:{u.vout}
                      </span>
                      <SatsAmount sats={u.amountSats} className="text-[13px] font-semibold text-success" />
                    </span>
                    <Pill label={script.toUpperCase()} className={SCRIPT_PILL_CLASS[script]} />
                    <Pill label={bucket.toUpperCase()} className={TYPE_PILL_CLASS[bucket]} />
                    <span className="truncate font-mono text-[11.5px] text-muted">{u.address ?? "No address"}</span>
                    <ExternalLinkButton txid={u.txid} />
                  </div>
                );
              })}
            </div>
          </div>
          <footer className="border-t border-line px-4.5 py-3">
            <span className="font-mono text-[10.5px] uppercase tracking-widest text-subtle">
              Last updated {lastUpdated.toLowerCase()}
            </span>
          </footer>
        </article>

        <article className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-line bg-surface">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4.5 py-4">
            <div className="flex items-baseline gap-3">
              <h3 className="text-[15px] font-semibold text-foreground">Recent transactions</h3>
              <span className="font-mono text-[10.5px] uppercase tracking-widest text-subtle">
                {transactions.length} total
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TabGroup
                value={txFilter}
                onChange={setTxFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "received", label: "Received" },
                  { value: "sent", label: "Sent" },
                  { value: "swap", label: "Swaps" },
                ]}
              />
              <div className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-raised p-1">
                {(["newest", "amount"] as TxSortKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleSort(key)}
                    className={`flex min-h-[30px] items-center gap-1 whitespace-nowrap rounded-full px-3.5 text-[11.5px] font-medium transition-colors ${
                      txSort === key ? "bg-primary text-white" : "text-muted hover:text-foreground"
                    }`}
                  >
                    {key === "newest" ? "Newest" : "Amount"}
                    <span>{sortDir[key] === "desc" ? "↓" : "↑"}</span>
                  </button>
                ))}
              </div>
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-3.5 pr-2.5">
            {filteredTx.length === 0 && (
              <p className="px-3 py-6 text-center text-[13px] text-subtle">No transactions match this filter.</p>
            )}
            {filteredTx.map((tx) => {
              const isReceive = tx.amountSats >= 0;
              return (
                <div
                  key={tx.txid}
                  role="button"
                  tabIndex={0}
                  onClick={() => void openUrl(explorerTxUrl(tx.txid))}
                  onKeyDown={(e) => e.key === "Enter" && openUrl(explorerTxUrl(tx.txid))}
                  className="grid min-h-[58px] cursor-pointer grid-cols-[38px_minmax(0,1fr)_auto_52px] items-center gap-3 rounded-lg border border-line bg-surface-raised px-3 py-2.5 text-left transition-colors hover:border-line-strong"
                >
                  <span
                    className={`flex h-[34px] w-[34px] items-center justify-center rounded-lg border ${
                      isReceive
                        ? "border-success/45 bg-success/[0.08] text-success"
                        : "border-danger/45 bg-danger/[0.08] text-danger"
                    }`}
                  >
                    {isReceive ? <ArrowDownLeft size={20} strokeWidth={2} /> : <ArrowUpRight size={20} strokeWidth={2} />}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate font-mono text-[12px] text-muted">{truncateMiddle(tx.txid, 16, 8)}</span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`w-fit rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] tracking-wide ${
                          tx.confirmations >= 6
                            ? "border-success/32 bg-success/10 text-success"
                            : "border-warning/35 bg-warning/10 text-warning"
                        }`}
                      >
                        {Math.min(tx.confirmations, 6)}/6 CONF
                      </span>
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <SatsAmount
                      sats={Math.abs(tx.amountSats)}
                      className={`text-[13px] font-semibold ${isReceive ? "text-success" : "text-danger"}`}
                    />
                    <span className="font-mono text-[10.5px] text-subtle">{formatRelativeTime(tx.time)}</span>
                  </span>
                  <ExternalLinkButton txid={tx.txid} />
                </div>
              );
            })}
          </div>
          <footer className="border-t border-line px-4.5 py-3">
            <span className="font-mono text-[10.5px] uppercase tracking-widest text-subtle">Live wallet</span>
          </footer>
        </article>
      </section>
    </div>
  );
}
