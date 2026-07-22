import { ArrowDownLeft, ArrowUpRight, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getBalances, getTransactions, getWalletInfo, listUtxos, syncWallet } from "../../api/commands";
import { Card, SatsAmount } from "../../components/ui/display";
import { useHeaderActionsStore } from "../../store/header-actions";
import { isCacheStale, REFRESH_INTERVAL_MS, useWalletCacheStore } from "../../store/wallet-cache";
import { withMinDelay } from "../../lib/timing";
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
    <Card
      className={`flex min-h-[150px] flex-col justify-between p-5 ${hero ? "min-h-[170px] border-primary/25" : "border-line-strong"}`}
    >
      <span className="font-mono text-[10.5px] uppercase tracking-widest text-subtle">{label}</span>
      <div>
        <SatsAmount
          sats={sats}
          className={hero ? "font-numeric text-[46px] font-bold tracking-tight text-primary" : "font-numeric text-[28px] font-bold text-foreground"}
        />
        {hero && <p className="mt-1 text-[13px] text-subtle">≈ {(sats / 1e8).toFixed(8)} BTC</p>}
      </div>
      <p className="text-[13px] text-muted">{caption}</p>
    </Card>
  );
}

const TAB_GLOW_TRANSITION = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.6 };

function TabGroup<T extends string>({
  options,
  value,
  onChange,
  groupId,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  groupId: string;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-white/[0.02] p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`relative min-h-[30px] whitespace-nowrap rounded-full px-3.5 text-[11.5px] font-medium transition-colors ${
            value === opt.value ? "text-primary" : "text-muted hover:text-foreground"
          }`}
        >
          {value === opt.value && (
            <motion.span
              layoutId={`tabglow-${groupId}`}
              transition={TAB_GLOW_TRANSITION}
              className="absolute inset-0 -z-10 rounded-full bg-primary/15 shadow-[0_0_12px_rgba(90,140,255,0.35)]"
            />
          )}
          {opt.label}
          {opt.count !== undefined && (
            <span className={`ml-1 font-mono text-[10px] ${value === opt.value ? "text-primary/80" : "text-subtle"}`}>
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
      className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-control border border-line text-muted transition-colors hover:border-primary/60 hover:bg-primary/[0.14] hover:text-primary-hover"
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
    <span className={`w-fit rounded-control border px-2 py-0.5 font-mono text-[9.5px] ${className}`}>{label}</span>
  );
}

export function WalletPage() {
  const info = useWalletCacheStore((s) => s.info);
  const balances = useWalletCacheStore((s) => s.balances);
  const utxos = useWalletCacheStore((s) => s.utxos);
  const transactions = useWalletCacheStore((s) => s.transactions);
  const lastUpdated = useWalletCacheStore((s) => s.lastUpdated);
  const setWalletCache = useWalletCacheStore((s) => s.setData);
  const setLastUpdatedCache = useWalletCacheStore((s) => s.setLastUpdated);

  const [refreshing, setRefreshing] = useState(false);
  // A fresh (non-stale) cache already means a real load happened recently, so
  // skip the full loading screen and just refresh quietly behind the existing
  // view. Past CACHE_TTL_MS the snapshot is treated as untrustworthy same as
  // having none, so the loading screen reappears rather than flashing old
  // balances as if they were current.
  const [initialLoading, setInitialLoading] = useState(() => isCacheStale(useWalletCacheStore.getState().updatedAt));

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
    setWalletCache({ info: nextInfo, balances: nextBalances, utxos: nextUtxos, transactions: nextTx });
  }, [setWalletCache]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      try {
        await syncWallet();
      } catch {
        // Best-effort — stale data is still worth showing.
      }
      await load();
      setLastUpdatedCache("Just now");
    } finally {
      setRefreshing(false);
    }
  }, [load, setLastUpdatedCache]);

  // The wallet's balance/UTXO/tx cache is only fresh after a sync, so every
  // mount needs the same sync-then-load sequence as the Refresh button — a
  // plain load() reads stale/empty state. The full loading screen (with its
  // min delay so it doesn't flash by unreadably) only runs when there's no
  // cached data yet; later visits refresh quietly behind the cached view.
  useEffect(() => {
    if (!initialLoading) {
      void refresh();
      return;
    }
    void withMinDelay(refresh(), 700).finally(() => setInitialLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    useHeaderActionsStore.getState().register(() => void refresh());
    return () => useHeaderActionsStore.getState().register(null);
  }, [refresh]);

  // Keeps the cache from ever actually reaching CACHE_TTL_MS during a
  // continuous session — real swaps/sends elsewhere shouldn't require the
  // user to bounce off the page to see updated balances.
  useEffect(() => {
    const id = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    useHeaderActionsStore.getState().setRefreshing(refreshing);
  }, [refreshing]);

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
    if (utxoFilter === "all") return utxos;
    return utxos.filter((u) => {
      const bucket = classifySpendType(u.spendType);
      if (utxoFilter === "regular") return bucket === "Regular";
      if (utxoFilter === "contract") return bucket === "Contract" || bucket === "Fidelity";
      return bucket === "Swap";
    });
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
    return rows;
  }, [transactions, txFilter, txSort, sortDir]);

  function toggleSort(key: TxSortKey) {
    if (key === txSort) {
      setSortDir((prev) => ({ ...prev, [key]: prev[key] === "desc" ? "asc" : "desc" }));
    } else {
      setTxSort(key);
    }
  }

  const totalBalance = (balances?.regular ?? 0) + (balances?.swap ?? 0);

  if (initialLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <span className="font-header text-[13px] uppercase tracking-widest text-muted">Loading wallet…</span>
        <span className="relative h-[2px] w-48 overflow-hidden rounded-pill bg-line">
          <span className="absolute inset-y-0 left-0 w-full origin-left animate-[status-fill_1.4s_ease-in-out_infinite] bg-success shadow-[0_0_8px_rgba(49,209,88,0.7)]" />
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden px-8 pb-8 pt-2">
      <div className="flex shrink-0 items-center gap-2 text-[13px] text-subtle">
        <span className="h-[7px] w-[7px] rounded-full bg-success shadow-[0_0_8px_rgba(49,209,88,0.7)]" />
        <span>Synced {lastUpdated.toLowerCase()}</span>
        <span>·</span>
        <span className="font-mono uppercase">{info?.walletName ?? "—"}</span>
      </div>

      <section className="mt-5 grid shrink-0 grid-cols-[minmax(320px,1.45fr)_repeat(3,minmax(210px,1fr))] gap-3">
        <BalanceCard label="Total Balance" sats={totalBalance} caption="Swap + Regular Coins" hero />
        <BalanceCard label="Swaps" sats={balances?.swap ?? 0} caption="Coins Received by swap txs" />
        <BalanceCard label="Regular" sats={balances?.regular ?? 0} caption="Coins Received by regular txs" />
        <BalanceCard label="Contracts" sats={balances?.contract ?? 0} caption="Coins stuck in HTLC" />
      </section>

      <section className="mt-3 grid min-h-0 flex-1 grid-cols-[minmax(0,1.46fr)_minmax(410px,1fr)] gap-3">
        <Card className="flex min-h-0 flex-col border-line-strong">
          <header className="flex items-baseline gap-3 border-b border-line px-4.5 py-4">
            <h3 className="font-header text-[15px] font-bold text-foreground">UTXOs</h3>
            <span className="font-mono text-[10.5px] uppercase tracking-widest text-subtle">
              {utxoCounts.all} unspent
            </span>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3.5">
            <TabGroup
              groupId="utxo-filter"
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
            <div className="flex flex-1 flex-col divide-y divide-line overflow-y-auto">
              {filteredUtxos.length === 0 && (
                <p className="px-3 py-6 text-center text-[13px] text-subtle">No UTXOs match this filter.</p>
              )}
              {filteredUtxos.map((u) => {
                const bucket = classifySpendType(u.spendType);
                const script = scriptTypeFromAddress(u.address);
                return (
                  <div
                    key={`${u.txid}:${u.vout}`}
                    className="grid min-h-[58px] grid-cols-[1.35fr_0.58fr_0.58fr_1.1fr_52px] items-center gap-3 px-3 py-2.5 transition-colors duration-200 hover:bg-white/[0.04]"
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
        </Card>

        <Card className="flex min-h-0 flex-col border-line-strong">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4.5 py-4">
            <div className="flex items-baseline gap-3">
              <h3 className="font-header text-[15px] font-bold text-foreground">Recent transactions</h3>
              <span className="font-mono text-[10.5px] uppercase tracking-widest text-subtle">
                {transactions.length} total
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TabGroup
                groupId="tx-filter"
                value={txFilter}
                onChange={setTxFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "received", label: "Received" },
                  { value: "sent", label: "Sent" },
                  { value: "swap", label: "Swaps" },
                ]}
              />
              <div className="inline-flex items-center gap-1 rounded-full bg-white/[0.02] p-1">
                {(["newest", "amount"] as TxSortKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleSort(key)}
                    className={`relative flex min-h-[30px] items-center gap-1 whitespace-nowrap rounded-full px-3.5 text-[11.5px] font-medium transition-colors ${
                      txSort === key ? "text-primary" : "text-muted hover:text-foreground"
                    }`}
                  >
                    {txSort === key && (
                      <motion.span
                        layoutId="tabglow-tx-sort"
                        transition={TAB_GLOW_TRANSITION}
                        className="absolute inset-0 -z-10 rounded-full bg-primary/15 shadow-[0_0_12px_rgba(90,140,255,0.35)]"
                      />
                    )}
                    {key === "newest" ? "Newest" : "Amount"}
                    <span>{sortDir[key] === "desc" ? "↓" : "↑"}</span>
                  </button>
                ))}
              </div>
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col divide-y divide-line overflow-y-auto px-3.5">
            {filteredTx.length === 0 && (
              <p className="px-3 py-6 text-center text-[13px] text-subtle">No transactions match this filter.</p>
            )}
            {filteredTx.map((tx) => {
              const isReceive = tx.amountSats >= 0;
              return (
                <div
                  key={`${tx.txid}:${tx.category}:${tx.address ?? ""}:${tx.amountSats}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => void openUrl(explorerTxUrl(tx.txid))}
                  onKeyDown={(e) => e.key === "Enter" && openUrl(explorerTxUrl(tx.txid))}
                  className="grid min-h-[58px] cursor-pointer grid-cols-[38px_minmax(0,1fr)_auto_52px] items-center gap-3 px-0 py-2.5 text-left transition-colors duration-200 hover:bg-white/[0.04]"
                >
                  <span
                    className={`flex h-[34px] w-[34px] items-center justify-center rounded-control border ${
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
                        className={`w-fit rounded-control border px-1.5 py-0.5 font-mono text-[9.5px] tracking-wide ${
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
        </Card>
      </section>
    </div>
  );
}
