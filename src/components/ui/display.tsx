import { AlertCircle, Check, Wallet } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

// The default "box" everywhere: translucent + backdrop-blur so the page
// behind actually shows through, plus a couple of soft blurred color blobs
// and a top sheen — since our background is too flat on its own for
// backdrop-blur alone to read as glass. Blobs sit at -z-10 so they stay
// behind non-positioned children instead of painting over them.
// No default border color here (Tailwind's cascade order for conflicting
// utilities isn't something callers should have to fight) — pass one via
// className, e.g. "border-line-strong".
export function Card({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`relative overflow-hidden rounded-card border bg-surface-raised/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-2xl ${className}`}
      {...props}
    >
      <div className="pointer-events-none absolute -left-10 -top-14 -z-10 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-14 -right-10 -z-10 h-48 w-48 rounded-full bg-white/[0.07] blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-20 bg-gradient-to-b from-white/[0.08] to-transparent" />
      {children}
    </div>
  );
}

interface ModalProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ title, children, footer }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-card border border-line-strong bg-surface p-6">
        <h3 className="font-header text-[15px] font-bold text-foreground">{title}</h3>
        <div className="mt-4 flex flex-col gap-3">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}

export function IconBadge({
  children,
  variant = "solid",
}: {
  children: ReactNode;
  variant?: "solid" | "outline";
}) {
  if (variant === "outline") {
    return (
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-surface-raised text-primary">
        {children}
      </div>
    );
  }
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-bold text-white">
      {children}
    </div>
  );
}

export type CheckState = "idle" | "running" | "passed" | "failed";

const statusDotClass: Record<CheckState, string> = {
  idle: "bg-subtle/40",
  running: "bg-success",
  passed: "bg-success",
  failed: "bg-danger",
};

export function StatusRow({
  label,
  state,
  detail,
}: {
  label: string;
  state: CheckState;
  detail?: string;
}) {
  return (
    <div className="relative flex items-center justify-between gap-3 overflow-hidden rounded-control border border-line bg-surface-raised px-3.5 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass[state]}`} />
        <span className="text-[13px] font-medium text-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-1.5 text-[11.5px]">
        {state === "passed" && <Check size={14} strokeWidth={2.5} className="text-success" />}
        {state === "failed" && <AlertCircle size={14} strokeWidth={2} className="text-danger" />}
        {detail && (
          <span className={state === "failed" ? "text-danger" : "text-subtle"}>{detail}</span>
        )}
      </div>
      {state === "running" && (
        <span className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden">
          <span className="absolute inset-y-0 left-0 w-full origin-left animate-[status-fill_1.4s_ease-in-out_infinite] bg-success shadow-[0_0_8px_rgba(49,209,88,0.7)]" />
        </span>
      )}
    </div>
  );
}

const cardButtonBase =
  "flex flex-col items-center gap-3 rounded-card border px-6 py-8 text-center transition-colors duration-200";

export function SelectableCard({
  icon,
  title,
  description,
  selected,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${cardButtonBase} ${
        selected ? "border-primary bg-primary/5" : "border-line hover:border-line-strong hover:bg-white/[0.02]"
      }`}
    >
      <IconBadge variant="outline">{icon}</IconBadge>
      <span className="text-[15px] font-semibold text-foreground">{title}</span>
      <span className="text-[12.5px] text-muted">{description}</span>
    </button>
  );
}

export function SatsAmount({ sats, className = "" }: { sats: number; className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
      <span>{Math.round(sats).toLocaleString()}</span>
      <SatsGlyph className="text-subtle" />
    </span>
  );
}

/** Stylized sats glyph (a bar with 3 ticks), mirroring the old app's .cs-sats-symbol. */
export function SatsGlyph({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="satoshis"
      className={`relative inline-block h-[1em] w-[0.72em] align-middle text-[0.72em] ${className}`}
    >
      <span className="absolute left-1/2 top-0 h-[0.14em] w-[0.14em] -translate-x-1/2 rounded-[1px] bg-current" />
      <span className="absolute left-1/2 bottom-0 h-[0.14em] w-[0.14em] -translate-x-1/2 rounded-[1px] bg-current" />
      <span className="absolute left-[0.04em] right-[0.04em] top-[0.245em] h-[0.1em] rounded-[1px] bg-current" />
      <span className="absolute left-[0.04em] right-[0.04em] top-[0.45em] h-[0.1em] rounded-[1px] bg-current" />
      <span className="absolute left-[0.04em] right-[0.04em] top-[0.655em] h-[0.1em] rounded-[1px] bg-current" />
    </span>
  );
}

export function WalletCard({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${cardButtonBase} w-64 py-10 border-primary/25 hover:border-primary/55 hover:bg-primary/[0.04]`}
    >
      <IconBadge variant="outline">
        <Wallet size={24} strokeWidth={1.8} />
      </IconBadge>
      <span className="max-w-full truncate font-header text-[15px] font-bold text-foreground">{name}</span>
      <span className="text-[12px] text-subtle">Click to unlock</span>
    </button>
  );
}
