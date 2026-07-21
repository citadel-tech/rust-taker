import { CheckCircle2, X, XCircle } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useToastStore } from "../../store/toast";

// Exact icon paths ported from taker-app/src/components/Nav.js so the
// sidebar matches the shipped app pixel-for-pixel.
const NAV_ITEMS: { path: string; label: string; d: string }[] = [
  { path: "/", label: "Wallet", d: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M16 14h2"/>' },
  { path: "/market", label: "Market", d: '<path d="M4 19V9M10 19V5M16 19v-7M22 19V8"/>' },
  { path: "/send", label: "Send", d: '<path d="M7 17L17 7M9 7h8v8"/>' },
  { path: "/receive", label: "Receive", d: '<path d="M17 7L7 17M7 9v8h8"/>' },
  { path: "/swap", label: "Swap", d: '<path d="M17 4l4 4-4 4M21 8H8M7 20l-4-4 4-4M3 16h13"/>' },
  { path: "/recovery", label: "Recovery", d: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="M9 12l2 2 4-4"/>' },
  { path: "/settings", label: "Settings", d: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 0 1 3.4 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H2"/>' },
];

function Sidebar() {
  return (
    <aside className="flex h-screen w-[220px] flex-none flex-col border-r border-line bg-[#0b0b0f]">
      <div className="grid min-h-[124px] grid-cols-[40px_1fr] items-start gap-3 border-b border-white/[0.075] px-5 pb-4.5 pt-7">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary font-mono text-[17px] font-extrabold text-white">
          C
        </div>
        <div className="min-w-0 pt-0.5">
          <h1 className="font-mono text-[17px] font-extrabold leading-tight text-primary">Coinswap</h1>
          <p className="mt-2.5 whitespace-nowrap font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#7b8391]">
            Taker app
          </p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-5 pt-3.5" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) =>
              `flex min-h-10 items-center gap-2.5 rounded-lg border px-3 text-[13px] font-medium transition-colors ${
                isActive
                  ? "border-primary bg-primary text-white"
                  : "border-transparent text-muted hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-foreground"
              }`
            }
          >
            <svg
              className="h-4 w-4 flex-none stroke-current"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: item.d }}
            />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

// Stacks with a translateY(index*56px) offset, mirroring the old app's showToast.
function ToastStack() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50">
      {toasts.map((t, i) => (
        <div
          key={t.id}
          style={{ transform: `translateY(${i * 56}px)` }}
          className={`pointer-events-auto absolute right-0 top-0 flex w-[420px] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border px-4 py-3.5 transition-transform ${
            t.kind === "error"
              ? "border-danger/32 bg-danger/[0.18] text-foreground"
              : "border-success/32 bg-success/[0.14] text-foreground"
          }`}
        >
          {t.kind === "error" ? (
            <XCircle size={20} strokeWidth={2} className="mt-0.5 flex-none text-danger" />
          ) : (
            <CheckCircle2 size={20} strokeWidth={2} className="mt-0.5 flex-none text-success" />
          )}
          <div className="min-w-0">
            <strong className="block">{t.kind === "error" ? "Error" : "Success"}</strong>
            <span className="mt-0.5 block break-words text-[13px] text-muted">{t.message}</span>
          </div>
          <button type="button" onClick={() => dismiss(t.id)} className="ml-2 flex-none text-subtle hover:text-foreground">
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function AppShell() {
  return (
    <div className="flex h-screen bg-bg">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <ToastStack />
    </div>
  );
}
