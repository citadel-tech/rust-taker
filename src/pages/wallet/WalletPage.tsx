import { useSessionStore } from "../../store/session";

export function WalletPage() {
  const { walletName, dataDir, recoveryPending } = useSessionStore();

  return (
    <div className="p-8">
      <h1 className="text-[20px] font-bold text-foreground">Wallet</h1>
      <p className="mt-1 text-[13px] text-muted">
        Signed in as <span className="text-foreground">{walletName}</span>
      </p>
      <p className="mt-0.5 text-[11.5px] text-subtle">{dataDir}</p>

      {recoveryPending && (
        <div className="mt-4 max-w-md rounded-sm border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-[12.5px] text-warning">
          There are unfinished contracts from a previous swap. Visit Recovery to check status.
        </div>
      )}

      <p className="mt-8 text-[13px] text-subtle">
        The rest of the app (balances, market, send/receive, swap) isn't built yet — this page
        just confirms the setup wizard worked.
      </p>
    </div>
  );
}
