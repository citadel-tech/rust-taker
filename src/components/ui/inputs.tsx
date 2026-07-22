import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  arrow?: boolean; // trailing arrow, e.g. "Test node connection →"
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50";

const buttonVariants: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "border border-line bg-surface-raised text-foreground hover:border-line-strong",
  ghost: "text-muted hover:text-foreground",
};

const buttonSizes: Record<Size, string> = {
  md: "h-10 px-5 text-[13px]",
  sm: "h-8 px-4 text-[12px]",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  arrow = false,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${buttonBase} ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      )}
      {children}
      {arrow && !loading && <ArrowRight size={15} strokeWidth={2} />}
    </button>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({ label, error, hint, id, className = "", ...props }: TextFieldProps) {
  const inputId = id ?? useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[12.5px] font-medium text-muted">
        {label}
      </label>
      <input
        id={inputId}
        className={`h-10 rounded-control border bg-surface-raised px-3 text-[13px] text-foreground outline-none transition-colors duration-200 placeholder:text-subtle ${
          error ? "border-danger bg-danger/5" : "border-line focus:border-primary focus:shadow-[0_0_0_3px_rgba(90,140,255,0.15)]"
        } ${className}`}
        {...props}
      />
      {error ? (
        <span className="text-[11.5px] text-danger">{error}</span>
      ) : hint ? (
        <span className="text-[11.5px] text-subtle">{hint}</span>
      ) : null}
    </div>
  );
}

interface PasswordFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function PasswordField({
  label,
  error,
  hint,
  id,
  className = "",
  ...props
}: PasswordFieldProps) {
  const inputId = id ?? useId();
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[12.5px] font-medium text-muted">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          className={`h-10 w-full rounded-control border bg-surface-raised px-3 pr-10 text-[13px] text-foreground outline-none transition-colors duration-200 placeholder:text-subtle ${
            error ? "border-danger bg-danger/5" : "border-line focus:border-primary focus:shadow-[0_0_0_3px_rgba(90,140,255,0.15)]"
          } ${className}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-subtle hover:text-muted"
        >
          {visible ? <EyeOff size={16} strokeWidth={1.6} /> : <Eye size={16} strokeWidth={1.6} />}
        </button>
      </div>
      {error ? (
        <span className="text-[11.5px] text-danger">{error}</span>
      ) : hint ? (
        <span className="text-[11.5px] text-subtle">{hint}</span>
      ) : null}
    </div>
  );
}

interface FieldChipProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string;
}

/** Compact "LABEL: value" input for tight spaces; use TextField when a hint/error row is needed. */
export function FieldChip({ label, className = "", ...props }: FieldChipProps) {
  return (
    <div className="flex items-center gap-1.5 rounded-control border border-line bg-surface-raised px-3 py-2 transition-colors duration-200 focus-within:border-primary">
      <span className="whitespace-nowrap text-[11px] uppercase tracking-wide text-subtle">
        {label}:
      </span>
      <input
        className={`w-full min-w-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-subtle ${className}`}
        {...props}
      />
    </div>
  );
}
