import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "./display";

interface ShellProps {
  title: string;
  status: string;
  children: ReactNode;
}

export function Shell({ title, status, children }: ShellProps) {
  return (
    <Card className="border-line-strong">
      <div className="flex items-center justify-between border-b border-line px-8 py-4">
        <span className="font-header text-[11px] uppercase tracking-widest text-subtle">{title}</span>
        <span className="flex items-center gap-1.5 font-header text-[11px] uppercase tracking-widest text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(90,140,255,0.7)]" />
          {status}
        </span>
      </div>
      {children}
    </Card>
  );
}

/** Solid base + one soft left-of-center glow (fades in all directions, no hard edge) + a barely-there dotted grid. */
export function Background() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden bg-bg">
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 75% 65% at 22% 58%, rgba(90,140,255,0.18), transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
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

/** e.g. <Headline text="Let's get you" accent="connected." /> */
export function Headline({ text, accent }: { text: string; accent: string }) {
  return (
    <h1 className="font-header text-[32px] font-bold leading-tight text-foreground">
      {text} <em className="italic text-primary">{accent}</em>
    </h1>
  );
}

export function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="whitespace-nowrap font-header text-[11px] uppercase tracking-wide text-subtle">
        Step {step} of {total}
      </span>
      <div className="h-1 flex-1 rounded-pill bg-line">
        <div
          className="h-full rounded-pill bg-primary transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-subtle">{pct}%</span>
    </div>
  );
}
