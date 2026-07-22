import { Check, CheckCircle2, RefreshCw, Settings, X, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Background } from "../ui/layout";
import { useHeaderActionsStore } from "../../store/header-actions";
import { useToastStore } from "../../store/toast";

const NAV_ITEMS: { path: string; label: string; d: string }[] = [
  { path: "/", label: "Wallet", d: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M16 14h2"/>' },
  { path: "/market", label: "Market", d: '<path d="M4 19V9M10 19V5M16 19v-7M22 19V8"/>' },
  { path: "/send", label: "Send", d: '<path d="M7 17L17 7M9 7h8v8"/>' },
  { path: "/swap", label: "Swap", d: '<path d="M17 4l4 4-4 4M21 8H8M7 20l-4-4 4-4M3 16h13"/>' },
];

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-header text-[15px] font-bold text-white">
        T
      </div>
      <div className="min-w-0 leading-tight">
        <div className="font-header text-[15px] font-bold text-foreground">Taker</div>
        <div className="text-[11px] text-subtle">Coinswap Protocol</div>
      </div>
    </div>
  );
}

function TopNav() {
  const onRefresh = useHeaderActionsStore((s) => s.onRefresh);
  const refreshing = useHeaderActionsStore((s) => s.refreshing);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const wasRefreshing = useRef(refreshing);

  useEffect(() => {
    if (wasRefreshing.current && !refreshing) {
      setJustRefreshed(true);
      const t = setTimeout(() => setJustRefreshed(false), 1600);
      wasRefreshing.current = refreshing;
      return () => clearTimeout(t);
    }
    wasRefreshing.current = refreshing;
  }, [refreshing]);

  return (
    <header
      className="sticky top-0 z-30 flex flex-none items-center justify-between gap-6 px-8 py-5"
      style={{
        background:
          "linear-gradient(to bottom, rgba(11,14,19,0.92) 0%, rgba(11,14,19,0.92) 65%, rgba(11,14,19,0) 100%)",
        backdropFilter: "blur(6px)",
      }}
    >
      <Logo />

      <nav className="flex items-center gap-1" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) =>
              `relative flex items-center gap-2 rounded-control px-3.5 py-2 text-[13.5px] transition-colors duration-200 ${
                isActive ? "font-semibold text-primary" : "font-medium text-muted hover:text-foreground"
              }`
            }
          >
            {({ isActive }) => (
              <>
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
                {isActive && (
                  <>
                    <motion.span
                      layoutId="nav-active-glow"
                      transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.6 }}
                      className="pointer-events-none absolute -inset-x-14 -bottom-4 -z-10 h-10 blur-md"
                      style={{
                        background:
                          "radial-gradient(ellipse 50% 100% at 50% 0%, rgba(90,140,255,0.5) 0%, rgba(90,140,255,0.18) 50%, transparent 100%)",
                      }}
                    />
                    <motion.span
                      layoutId="nav-active-line"
                      transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.6 }}
                      className="pointer-events-none absolute -inset-x-10 -bottom-1.5 h-px"
                      style={{
                        background: "linear-gradient(to right, transparent, rgba(111,162,255,0.85), transparent)",
                      }}
                    />
                  </>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onRefresh?.()}
          disabled={!onRefresh}
          title="Refresh"
          className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
            justRefreshed ? "text-success" : "text-muted hover:text-foreground"
          }`}
        >
          {justRefreshed ? (
            <Check size={16} strokeWidth={2} />
          ) : (
            <RefreshCw size={16} strokeWidth={1.8} className={refreshing ? "animate-spin" : ""} />
          )}
        </button>
        <NavLink
          to="/settings"
          title="Settings"
          className={({ isActive }) =>
            `flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200 ${
              isActive ? "text-primary" : "text-muted hover:text-foreground"
            }`
          }
        >
          <Settings size={16} strokeWidth={1.8} />
        </NavLink>
      </div>
    </header>
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
          className={`pointer-events-auto absolute right-0 top-0 flex w-[420px] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-card border px-4 py-3.5 transition-transform ${
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
    <div className="relative h-screen">
      <Background />
      <div className="relative flex h-screen flex-col">
        <TopNav />
        <main className="min-h-0 min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
      <ToastStack />
    </div>
  );
}
