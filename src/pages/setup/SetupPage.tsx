import { GlowBackdrop, Shell } from "../../components/ui/layout";
import { useSessionStore } from "../../store/session";
import { SelectWalletStep } from "./SelectWalletStep";

export function SetupPage() {
  const setInitialized = useSessionStore((s) => s.setInitialized);

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-10">
      <GlowBackdrop />
      <div className="relative w-full max-w-2xl">
        <Shell title="Coinswap · Taker" status="Onboarding">
          <SelectWalletStep onSuccess={setInitialized} />
        </Shell>
      </div>
    </div>
  );
}
