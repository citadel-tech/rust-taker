import { useEffect, useState } from "react";
import { checkPort, getVersionInfo } from "./api/commands";
import type { PortStatus, VersionInfo } from "./api/types";

interface ProbeRow {
  label: string;
  host: string;
  port: number;
  status?: PortStatus;
}

const DEFAULT_PROBES: ProbeRow[] = [
  { label: "Bitcoin Core RPC", host: "127.0.0.1", port: 38332 },
  { label: "ZMQ", host: "127.0.0.1", port: 28332 },
  { label: "Tor SOCKS", host: "127.0.0.1", port: 9050 },
  { label: "Tor control", host: "127.0.0.1", port: 9051 },
];

function App() {
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [probes, setProbes] = useState<ProbeRow[]>(DEFAULT_PROBES);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    getVersionInfo().then(setVersion).catch(console.error);
  }, []);

  async function runChecks() {
    setChecking(true);
    const results = await Promise.all(
      DEFAULT_PROBES.map(async (p) => ({
        ...p,
        status: await checkPort(p.host, p.port, 1500),
      })),
    );
    setProbes(results);
    setChecking(false);
  }

  return (
    <main className="mx-auto max-w-2xl p-10">
      <h1 className="text-2xl font-bold text-accent">Coinswap Taker</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Tauri backend scaffold — connectivity prechecks
        {version && (
          <span>
            {" "}
            · v{version.appVersion} · coinswap: {version.coinswapSource}
          </span>
        )}
      </p>

      <div className="mt-8 rounded-lg bg-surface-raised p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Connectivity</h2>
          <button
            onClick={runChecks}
            disabled={checking}
            className="rounded bg-accent px-4 py-1.5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
          >
            {checking ? "Checking…" : "Run checks"}
          </button>
        </div>
        <ul className="mt-4 space-y-2">
          {probes.map((p) => (
            <li
              key={p.label}
              className="flex items-center justify-between rounded bg-surface px-4 py-2 text-sm"
            >
              <span>
                {p.label}
                <span className="ml-2 text-neutral-500">
                  {p.host}:{p.port}
                </span>
              </span>
              <span>
                {p.status === undefined
                  ? "—"
                  : p.status.reachable
                    ? "✅ reachable"
                    : "❌ down"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

export default App;
