import { AlertCircle, Check, Loader2, Wallet } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-lg border border-line bg-surface p-6 ${className}`} {...props} />;
}

interface ModalProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ title, children, footer }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-line-strong bg-surface p-6">
        <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
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
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line-strong text-muted">
        {children}
      </div>
    );
  }
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-hover font-bold text-white shadow-[0_0_20px_rgba(81,141,239,0.35)]">
      {children}
    </div>
  );
}

export type CheckState = "idle" | "running" | "passed" | "failed";

const statusDotClass: Record<CheckState, string> = {
  idle: "bg-subtle/40",
  running: "bg-warning",
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
    <div className="flex items-center justify-between gap-3 rounded-sm bg-surface-raised px-3.5 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass[state]}`} />
        <span className="text-[13px] font-medium text-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-1.5 text-[11.5px]">
        {state === "running" && (
          <Loader2 size={14} strokeWidth={2} className="animate-spin text-warning" />
        )}
        {state === "passed" && <Check size={14} strokeWidth={2.5} className="text-success" />}
        {state === "failed" && <AlertCircle size={14} strokeWidth={2} className="text-danger" />}
        {detail && (
          <span className={state === "failed" ? "text-danger" : "text-subtle"}>{detail}</span>
        )}
      </div>
    </div>
  );
}

const cardButtonBase =
  "flex flex-col items-center gap-3 rounded-2xl border px-6 py-8 text-center transition-colors";

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
        selected ? "border-primary bg-primary/5" : "border-line hover:border-line-strong hover:bg-white/2"
      }`}
    >
      <IconBadge variant="outline">{icon}</IconBadge>
      <span className="text-[15px] font-semibold text-foreground">{title}</span>
      <span className="text-[12.5px] text-muted">{description}</span>
    </button>
  );
}

export function WalletCard({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${cardButtonBase} w-52 border-line hover:border-line-strong hover:bg-white/2`}
    >
      <IconBadge variant="outline">
        <Wallet size={20} strokeWidth={1.8} />
      </IconBadge>
      <span className="max-w-full truncate text-[14px] font-semibold text-foreground">{name}</span>
      <span className="text-[12px] text-subtle">Click to unlock</span>
    </button>
  );
}
