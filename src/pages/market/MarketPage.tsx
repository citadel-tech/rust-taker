import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Inbox, RefreshCw, Search } from "lucide-react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getOffers, pollMaker, removeMaker, syncOfferbook } from "../../api/commands";
import type { Maker } from "../../api/types";
import { Card, Modal, SatsAmount } from "../../components/ui/display";
import { Button } from "../../components/ui/inputs";
import { estimateMakerFee, formatTorEndpoint } from "../../lib/market-format";
import { explorerTxUrl } from "../../lib/wallet-format";
import { useToastStore } from "../../store/toast";

type MakerStatus = "good" | "bad" | "unresponsive";

function StatCard({ label, value, caption }: { label: string; value: React.ReactNode; caption: string }) {
  return (
    <Card className="flex min-h-[128px] flex-col justify-center gap-1.5 border-line-strong p-5">
      <span className="font-mono text-[10.5px] uppercase tracking-widest text-subtle">{label}</span>
      <div className="text-[26px] font-bold text-foreground">{value}</div>
      <p className="text-[13px] text-muted">{caption}</p>
    </Card>
  );
}

function TooltipButton({
  onClick,
  disabled,
  danger,
  tooltip,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`min-h-7 whitespace-nowrap rounded-full border px-2.5 text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
          danger
            ? "border-line text-muted hover:border-danger/52 hover:bg-danger/10 hover:text-danger"
            : "border-line text-muted hover:border-line-strong hover:bg-white/5 hover:text-foreground"
        }`}
      >
        {children}
      </button>
      <div className="pointer-events-none absolute left-1/2 top-[calc(100%+9px)] z-20 w-max max-w-[260px] -translate-x-1/2 translate-y-1.5 rounded-lg border border-line-strong bg-bg px-2.5 py-2 text-left text-[11.5px] font-medium leading-snug text-foreground opacity-0 shadow-lg transition-all group-hover:translate-y-0 group-hover:opacity-100">
        {tooltip}
      </div>
    </div>
  );
}

function FidelityBondModal({ maker, onClose }: { maker: Maker; onClose: () => void }) {
  const bond = maker.offer!;
  return (
    <Modal title="Fidelity Bond Details" footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line p-3.5">
          <span className="mb-2 block text-[11px] text-subtle">Tor Address</span>
          <strong className="break-all font-mono text-[13px] text-foreground">{maker.address}</strong>
        </div>
        <div className="rounded-xl border border-line p-3.5">
          <span className="mb-2 block text-[11px] text-subtle">Bond Amount</span>
          <strong className="font-mono text-[13px] text-foreground">
            <SatsAmount sats={bond.bondAmountSats} />
          </strong>
        </div>
        <div className="rounded-xl border border-line p-3.5">
          <span className="mb-2 block text-[11px] text-subtle">Bond Status</span>
          <strong className={`font-mono text-[13px] ${bond.bondIsSpent ? "text-danger" : "text-success"}`}>
            {bond.bondIsSpent ? "Spent" : "Active"}
          </strong>
        </div>
        <div className="rounded-xl border border-line p-3.5">
          <span className="mb-2 block text-[11px] text-subtle">Unlocks At</span>
          <strong className="font-mono text-[13px] text-foreground">Block {bond.bondLocktimeHeight.toLocaleString()}</strong>
        </div>
        <div className="col-span-2 rounded-xl border border-line p-3.5">
          <span className="mb-2 block text-[11px] text-subtle">Bond Txid</span>
          <button
            type="button"
            onClick={() => void openUrl(explorerTxUrl(bond.bondTxid))}
            className="break-all text-left font-mono text-[13px] text-primary hover:text-primary-hover"
          >
            {bond.bondTxid}:{bond.bondVout}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function FeeCalculatorModal({ maker, onClose }: { maker: Maker; onClose: () => void }) {
  const offer = maker.offer!;
  const [amount, setAmount] = useState(offer.minSize > 0 ? offer.minSize : Math.min(10_000_000, offer.maxSize || 10_000_000));
  const [position, setPosition] = useState(1);
  const [totalMakers, setTotalMakers] = useState(2);

  const invalid = !Number.isInteger(position) || !Number.isInteger(totalMakers) || position < 1 || totalMakers < 1 || position > totalMakers;
  const estimate = invalid
    ? null
    : estimateMakerFee({
        baseFee: offer.baseFee,
        amountRelativeFeePct: offer.amountRelativeFeePct,
        timeRelativeFeePct: offer.timeRelativeFeePct,
        amountSats: amount,
        makerPosition: position,
        totalMakers,
      });
  const totalPercent = estimate && amount > 0 ? (estimate.totalFee / amount) * 100 : 0;

  return (
    <Modal
      title="Estimate swap cost"
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <p className="truncate font-mono text-[11px] text-muted" title={maker.address}>
        {formatTorEndpoint(maker.address, 22, 12, true)}
      </p>

      <label className="flex flex-col gap-2">
        <span className="font-mono text-[10px] font-extrabold uppercase tracking-widest text-subtle">Swap Amount</span>
        <input
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(Math.max(0, Math.round(Number(e.target.value))))}
          className="h-[46px] rounded-lg border border-line-strong bg-surface-raised px-3 font-mono text-[13.5px] font-medium text-foreground outline-none focus:border-primary/65"
        />
      </label>
      <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] text-subtle">
        <span>Maker range</span>
        <strong className="font-extrabold text-muted">
          {offer.minSize.toLocaleString()} - {offer.maxSize.toLocaleString()} sats
        </strong>
      </div>

      <label className="mt-4 flex flex-col gap-2">
        <span className="font-mono text-[10px] font-extrabold uppercase tracking-widest text-subtle">Maker Position in Circuit (n)</span>
        <input
          type="number"
          min={1}
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          className="h-[46px] rounded-lg border border-line-strong bg-surface-raised px-3 font-mono text-[13.5px] font-medium text-foreground outline-none focus:border-primary/65"
        />
      </label>
      <label className="mt-4 flex flex-col gap-2">
        <span className="font-mono text-[10px] font-extrabold uppercase tracking-widest text-subtle">Total Makers in Swap (m)</span>
        <input
          type="number"
          min={1}
          value={totalMakers}
          onChange={(e) => setTotalMakers(Number(e.target.value))}
          className="h-[46px] rounded-lg border border-line-strong bg-surface-raised px-3 font-mono text-[13.5px] font-medium text-foreground outline-none focus:border-primary/65"
        />
      </label>
      <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] text-subtle">
        <span>Refund locktime = 20 x (m - n + 1)</span>
        <strong className="font-extrabold text-muted">{estimate ? `${estimate.refundLocktime} blocks` : "Enter position"}</strong>
      </div>
      {invalid && (
        <p className="mt-1.5 text-[11px] text-danger">Enter positive maker counts where n is not greater than m.</p>
      )}

      <div className="mt-4 rounded-lg border border-primary/28 bg-primary/[0.08] p-3.5 font-mono text-[12px] font-bold leading-relaxed text-foreground">
        <span className="mb-1 block text-primary">Formula</span>
        <strong>Total Fee</strong> = Base Fee + (Swap Amount x Liquidity Fee) + (Refund Locktime x Swap Amount x Time Rate)
      </div>

      <div className="mt-4 rounded-xl border border-line-strong bg-surface-raised p-3.5">
        <div className="grid grid-cols-[1fr_auto] gap-x-3.5 gap-y-1 border-b border-dashed border-white/10 py-2">
          <span className="font-mono text-[10px] text-subtle">Base Fee</span>
          <strong className="font-mono text-[14px] font-extrabold text-foreground">
            {(estimate?.baseFee ?? 0).toLocaleString()} sats
          </strong>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-x-3.5 gap-y-1 border-b border-dashed border-white/10 py-2">
          <span className="font-mono text-[10px] text-subtle">Liquidity Fee</span>
          <strong className="font-mono text-[14px] font-extrabold text-foreground">
            {Math.round(estimate?.liquidityFee ?? 0).toLocaleString()} sats
          </strong>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-x-3.5 gap-y-1 border-b border-dashed border-white/10 py-2">
          <span className="font-mono text-[10px] text-subtle">Time Fee</span>
          <strong className="font-mono text-[14px] font-extrabold text-foreground">
            {Math.round(estimate?.timeFee ?? 0).toLocaleString()} sats
          </strong>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-x-3.5 gap-y-1 pt-3">
          <span className="font-mono text-[10px] text-subtle">Total Fee</span>
          <strong className="font-mono text-[19px] font-extrabold text-primary">
            {Math.round(estimate?.totalFee ?? 0).toLocaleString()} sats
          </strong>
          <small className="col-span-2 font-mono text-[10px] text-subtle">
            {estimate ? `${totalPercent.toFixed(4)}% of swap amount` : "Enter position to calculate total fee"}
          </small>
        </div>
      </div>

      <p className="mt-3.5 font-mono text-[10px] uppercase tracking-widest text-subtle">
        Estimates exclude on-chain miner fees.
      </p>
    </Modal>
  );
}

function ConfirmRemoveModal({ address, onConfirm, onCancel, removing }: { address: string; onConfirm: () => void; onCancel: () => void; removing: boolean }) {
  return (
    <Modal
      title="Remove maker?"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={removing}>Cancel</Button>
          <Button onClick={onConfirm} loading={removing}>Remove</Button>
        </>
      }
    >
      <p className="break-all text-[13px] text-muted">
        Remove <span className="font-mono text-foreground">{address}</span> from the offerbook? It will no longer
        appear in market results until rediscovered.
      </p>
    </Modal>
  );
}

export function MarketPage() {
  const [good, setGood] = useState<Maker[]>([]);
  const [bad, setBad] = useState<Maker[]>([]);
  const [unresponsive, setUnresponsive] = useState<Maker[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<MakerStatus>("good");
  const [pollingAddress, setPollingAddress] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [feeCalcMaker, setFeeCalcMaker] = useState<Maker | null>(null);
  const [bondMaker, setBondMaker] = useState<Maker | null>(null);
  const [footerTick, setFooterTick] = useState(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pushToast = useToastStore((s) => s.push);

  const applyOfferBook = useCallback((view: { good: Maker[]; bad: Maker[]; unresponsive: Maker[] }) => {
    setGood(view.good);
    setBad(view.bad);
    setUnresponsive(view.unresponsive);
  }, []);

  const load = useCallback(async () => {
    const view = await getOffers();
    applyOfferBook(view);
    return view;
  }, [applyOfferBook]);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch (e) {
        pushToast("error", (e as { message?: string })?.message ?? "Failed to load makers.");
      } finally {
        setLoading(false);
      }
    })();
  }, [load, pushToast]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    pollIntervalRef.current = setInterval(() => {
      void load().catch(() => {});
    }, 2000);
    try {
      await syncOfferbook();
      await load();
      setFooterTick((t) => t + 1);
    } catch (e) {
      pushToast("error", (e as { message?: string })?.message ?? "Sync failed.");
    } finally {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
      setRefreshing(false);
    }
  }, [load, pushToast]);

  useEffect(() => () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
  }, []);

  const stats = useMemo(() => {
    const totalLiquidity = good.reduce((sum, m) => sum + (m.offer?.maxSize ?? 0), 0);
    const totalFidelity = good.reduce((sum, m) => sum + (m.offer?.bondAmountSats ?? 0), 0);
    return { totalLiquidity, totalFidelity };
  }, [good]);

  const buckets: Record<MakerStatus, Maker[]> = { good, bad, unresponsive };
  const displayed = buckets[tab];

  async function poll(address: string) {
    if (pollingAddress) return;
    setPollingAddress(address);
    try {
      const fresh = await pollMaker(address);
      setGood((g) => g.filter((m) => m.address !== address));
      setBad((b) => b.filter((m) => m.address !== address));
      setUnresponsive((u) => u.filter((m) => m.address !== address));
      if (fresh.state === "good") setGood((g) => [...g, fresh]);
      else if (fresh.state === "bad") setBad((b) => [...b, fresh]);
      else setUnresponsive((u) => [...u, fresh]);

      if (fresh.state === "good") {
        pushToast("success", "Maker responded with a fresh offer. Offerbook updated.");
      } else {
        pushToast("error", "Maker did not respond with a usable fresh offer.");
      }
    } catch (e) {
      pushToast("error", `Poll failed: ${(e as { message?: string })?.message ?? "unknown error"}`);
    } finally {
      setPollingAddress(null);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await removeMaker(removeTarget);
      await load();
      setRemoveTarget(null);
    } catch (e) {
      pushToast("error", `Remove failed: ${(e as { message?: string })?.message ?? "unknown error"}`);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-8">
      <header className="flex shrink-0 items-start justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-bold leading-none tracking-tight text-foreground">Market</h1>
          <p className="mt-1.5 max-w-lg text-[13px] text-muted">
            Live view of coinswap makers routing through your Tor circuit.
          </p>
          <div className="mt-3 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-widest text-subtle">
            <span className="h-[7px] w-[7px] rounded-full bg-success shadow-[0_0_12px_rgba(47,212,131,0.72)]" />
            <span>{good.length + bad.length + unresponsive.length} makers available</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[13px] font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          <RefreshCw size={15} strokeWidth={2} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {(loading || refreshing) && (
        <div className="mt-5 shrink-0 rounded-2xl border border-primary/35 bg-primary/10 px-4.5 py-3.5">
          <div className="mb-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-primary-hover">
            <span className="flex items-center gap-2">
              <RefreshCw size={16} strokeWidth={2} className="animate-spin" />
              Syncing market data...
            </span>
            <span className="text-subtle">Please wait</span>
          </div>
          <div className="mb-3 h-1 overflow-hidden rounded-full bg-white/[0.08]">
            <span className="block h-full w-full origin-left animate-[market-progress_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-primary via-primary-hover to-primary" />
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-primary-hover">
            <Search size={14} strokeWidth={2} />
            Discovering makers over Tor network...
          </div>
        </div>
      )}

      <section className="mt-5 grid shrink-0 grid-cols-3 gap-3">
        <StatCard label="Fidelity Locked" value={<SatsAmount sats={stats.totalFidelity} />} caption={`Across ${good.length} active makers.`} />
        <StatCard label="Total Liquidity" value={<SatsAmount sats={stats.totalLiquidity} />} caption="Spendable maker depth." />
        <StatCard
          label="Active Makers"
          value={
            <span className="inline-flex items-baseline gap-2">
              {good.length}
              <small className="text-[12px] font-medium text-subtle">responding</small>
            </span>
          }
          caption={`${good.length} good · ${bad.length} bad · ${unresponsive.length} unresponsive in this window.`}
        />
      </section>

      <Card className="mt-3 flex min-h-0 flex-1 flex-col border-line-strong">
        <div className="flex shrink-0 items-center justify-between gap-3.5 border-b border-line px-4.5 py-4">
          <div className="inline-flex items-center gap-1 rounded-full bg-white/[0.02] p-1">
            {(
              [
                ["good", "Good Makers", good.length],
                ["bad", "Bad Makers", bad.length],
                ["unresponsive", "Unresponsive", unresponsive.length],
              ] as [MakerStatus, string, number][]
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`relative min-h-[30px] whitespace-nowrap rounded-full px-3.5 text-[11.5px] font-medium transition-colors ${
                  tab === value ? "text-success" : "text-muted hover:text-foreground"
                }`}
              >
                {tab === value && (
                  <motion.span
                    layoutId="tabglow-market-status"
                    transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.6 }}
                    className="absolute inset-0 -z-10 rounded-full bg-success/15 shadow-[0_0_12px_rgba(47,212,131,0.35)]"
                  />
                )}
                {label} <span className={`ml-1 font-mono text-[10px] ${tab === value ? "text-success" : "text-subtle"}`}>{count}</span>
              </button>
            ))}
          </div>
          <span className="font-mono text-[10.5px] uppercase tracking-widest text-subtle">{displayed.length} {tab} offers</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="sticky top-0 z-[1] grid grid-cols-[minmax(150px,1.35fr)_repeat(5,minmax(74px,0.78fr))_minmax(122px,0.9fr)_minmax(250px,max-content)] gap-3 bg-surface-raised px-7.5 pb-2.5 pt-3.5 font-mono text-[10px] uppercase tracking-widest text-subtle">
            <div>Tor Address</div>
            <div className="text-right">Base Fee</div>
            <div className="text-right">Liquidity Fee</div>
            <div className="text-right">Time Rate</div>
            <div className="text-right">Min Swap</div>
            <div className="text-right">Max Swap</div>
            <div className="text-right">Fidelity Bond</div>
            <div className="text-right">Actions</div>
          </div>

          <div className="flex flex-col gap-1.5 px-4.5 pb-3">
            {loading ? (
              <div className="grid min-h-[220px] place-items-center gap-2.5 text-center text-[13px] text-subtle">
                <RefreshCw size={42} strokeWidth={1.6} className="animate-spin text-primary" />
                <strong className="text-[15px] text-foreground">Syncing market data...</strong>
                <span>Fetching makers over Tor network</span>
              </div>
            ) : good.length + bad.length + unresponsive.length === 0 ? (
              <div className="grid min-h-[220px] place-items-center gap-2.5 text-center text-[13px] text-subtle">
                <Inbox size={42} strokeWidth={1.6} className="text-primary" />
                <strong className="text-[15px] text-foreground">No makers found</strong>
                <Button size="sm" onClick={() => void refresh()}>
                  <RefreshCw size={14} strokeWidth={2} /> Refresh
                </Button>
              </div>
            ) : displayed.length === 0 ? (
              <div className="grid min-h-[220px] place-items-center gap-2.5 text-center text-[13px] text-subtle">
                <Inbox size={42} strokeWidth={1.6} className="text-primary" />
                <strong className="text-[15px] text-foreground">No {tab} makers found</strong>
              </div>
            ) : (
              displayed.map((maker) => {
                const offer = maker.offer;
                const isPolling = pollingAddress === maker.address;
                return (
                  <div
                    key={maker.address}
                    className="grid min-h-[50px] grid-cols-[minmax(150px,1.35fr)_repeat(5,minmax(74px,0.78fr))_minmax(122px,0.9fr)_minmax(250px,max-content)] items-center gap-3 rounded-lg border border-line bg-surface-raised px-3 py-2.5 transition-colors hover:border-line-strong"
                  >
                    <div className="truncate font-mono text-[11px] text-muted" title={maker.address}>
                      {formatTorEndpoint(maker.address, 8, 6, true)}
                    </div>
                    <div className="text-right font-mono text-[11px] font-semibold text-primary">
                      {(offer?.baseFee ?? 0).toLocaleString()}
                    </div>
                    <div className="text-right font-mono text-[11px] font-semibold text-foreground">
                      {(offer?.amountRelativeFeePct ?? 0).toFixed(3)}
                    </div>
                    <div className="text-right font-mono text-[11px] font-semibold text-foreground">
                      {(offer?.timeRelativeFeePct ?? 0).toFixed(4)}
                    </div>
                    <div className="text-right font-mono text-[11px] font-semibold text-subtle">
                      {(offer?.minSize ?? 0).toLocaleString()}
                    </div>
                    <div className="text-right font-mono text-[11px] font-semibold text-subtle">
                      {(offer?.maxSize ?? 0).toLocaleString()}
                    </div>
                    <div className="flex items-center justify-end gap-2 font-mono text-[11px] font-semibold text-foreground">
                      <span>{offer && offer.bondAmountSats > 0 ? offer.bondAmountSats.toLocaleString() : "N/A"}</span>
                      {offer && offer.bondAmountSats > 0 && (
                        <button
                          type="button"
                          title="View fidelity bond"
                          onClick={() => setBondMaker(maker)}
                          className="grid h-[18px] w-[18px] place-items-center rounded text-subtle hover:bg-primary/10 hover:text-primary"
                        >
                          <ExternalLink size={12} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                    <div className="flex justify-end gap-2">
                      <TooltipButton
                        tooltip="Calculate the estimated maker fee for this maker using your amount and hop position."
                        onClick={() => setFeeCalcMaker(maker)}
                        disabled={!offer}
                      >
                        Calculate
                      </TooltipButton>
                      <TooltipButton
                        tooltip="Ask this maker for a fresh offer now and update its availability and fee data."
                        onClick={() => void poll(maker.address)}
                        disabled={isPolling}
                      >
                        {isPolling ? "Polling..." : "Poll"}
                      </TooltipButton>
                      <TooltipButton
                        tooltip="Remove this maker from your local offerbook so it no longer appears in market results."
                        onClick={() => setRemoveTarget(maker.address)}
                        danger
                      >
                        Remove
                      </TooltipButton>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex min-h-[54px] shrink-0 items-center justify-end border-t border-line px-4.5 py-3 font-mono text-[10.5px] uppercase tracking-widest text-subtle">
          Showing {displayed.length} {tab} offers · {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          <span className="hidden">{footerTick}</span>
        </div>
      </Card>

      {feeCalcMaker && <FeeCalculatorModal maker={feeCalcMaker} onClose={() => setFeeCalcMaker(null)} />}
      {bondMaker && <FidelityBondModal maker={bondMaker} onClose={() => setBondMaker(null)} />}
      {removeTarget && (
        <ConfirmRemoveModal
          address={removeTarget}
          removing={removing}
          onConfirm={() => void confirmRemove()}
          onCancel={() => setRemoveTarget(null)}
        />
      )}

    </div>
  );
}
