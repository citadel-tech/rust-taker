import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

interface ShellProps {
  title: string;
  status: string;
  children: ReactNode;
}

export function Shell({ title, status, children }: ShellProps) {
  return (
    <div className="relative rounded-3xl border border-line bg-surface/80 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-line px-8 py-4">
        <span className="text-[11px] uppercase tracking-widest text-subtle">{title}</span>
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          {status}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Ambient background glow; kept as a component instead of global CSS. */
export function GlowBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute -bottom-40 -left-40 h-[560px] w-[560px] rounded-full bg-primary/20 blur-[120px]" />
    </div>
  );
}

export function FooterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-t border-line px-10 py-5">
      <span className="flex items-center gap-1.5 text-[12.5px] text-subtle">
        <CircleAlert size={14} strokeWidth={1.8} />
        Need help? <span className="text-primary">Setup guide</span>
      </span>
      <div className="flex gap-3">{children}</div>
    </div>
  );
}

export function Eyebrow({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-[11px] uppercase tracking-wide text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
      {label}
    </span>
  );
}

/** e.g. <Headline text="Let's get you" accent="connected." /> */
export function Headline({ text, accent }: { text: string; accent: string }) {
  return (
    <h1 className="text-[32px] font-bold leading-tight text-foreground">
      {text} <em className="italic text-primary">{accent}</em>
    </h1>
  );
}

export function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="whitespace-nowrap text-[11px] uppercase tracking-wide text-subtle">
        Step {step} of {total}
      </span>
      <div className="h-1 flex-1 rounded-full bg-line">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-subtle">{pct}%</span>
    </div>
  );
}
