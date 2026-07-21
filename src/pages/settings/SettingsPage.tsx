import { save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, CheckCircle2, Copy, ExternalLink, Eye, EyeOff, Save, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { backupWallet, checkBitcoinCore, checkPort, checkTor } from "../../api/commands";
import type { CoreStatus } from "../../api/types";
import { Modal } from "../../components/ui/display";
import { Button, PasswordField, TextField } from "../../components/ui/inputs";
import {
  HARDCODED_DEFAULTS,
  RPC_HOST,
  loadConnectivityDefaults,
  saveConnectivityDefaults,
  type ConnectivityConfig,
} from "../../lib/connectivity";
import { useToastStore } from "../../store/toast";

const BITCOIN_GUIDE_URL = "https://github.com/citadel-tech/coinswap/blob/master/docs/bitcoind.md";

interface TestRow {
  label: string;
  ok: boolean;
  message: string;
}

function TestResultRows({ rows }: { rows: TestRow[] }) {
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-raised px-3 py-2 text-[12px]">
          <span className={`flex items-center gap-1.5 font-medium ${r.ok ? "text-success" : "text-danger"}`}>
            {r.ok ? <CheckCircle2 size={13} strokeWidth={2} /> : <XCircle size={13} strokeWidth={2} />}
            {r.label}
          </span>
          <span className="truncate text-subtle">{r.message}</span>
        </div>
      ))}
    </div>
  );
}

function SectionDot({ color = "bg-primary" }: { color?: string }) {
  return <span className={`h-1.5 w-1.5 rounded-full ${color}`} />;
}

export function SettingsPage() {
  const pushToast = useToastStore((s) => s.push);
  const [config, setConfig] = useState<ConnectivityConfig>(loadConnectivityDefaults);
  const [torPasswordVisible, setTorPasswordVisible] = useState(false);

  const [coreStatus, setCoreStatus] = useState<CoreStatus | null>(null);
  const [testingRpc, setTestingRpc] = useState(false);
  const [rpcRows, setRpcRows] = useState<TestRow[] | null>(null);
  const [testingTor, setTestingTor] = useState(false);
  const [torRows, setTorRows] = useState<TestRow[] | null>(null);

  const [backupOpen, setBackupOpen] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [backupConfirm, setBackupConfirm] = useState("");
  const [backupError, setBackupError] = useState<string | undefined>();
  const [backingUp, setBackingUp] = useState(false);

  const [confirmReset, setConfirmReset] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void checkBitcoinCore({ host: RPC_HOST, port: config.rpcPort, username: config.rpcUsername, password: config.rpcPassword })
      .then(setCoreStatus)
      .catch(() => setCoreStatus(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function testBitcoind() {
    setTestingRpc(true);
    const rpc = { host: RPC_HOST, port: config.rpcPort, username: config.rpcUsername, password: config.rpcPassword };
    const [coreResult, zmqResult] = await Promise.allSettled([checkBitcoinCore(rpc), checkPort(RPC_HOST, config.zmqPort)]);

    const rpcOk = coreResult.status === "fulfilled";
    if (rpcOk) setCoreStatus(coreResult.value);
    else setCoreStatus(null);

    setRpcRows([
      {
        label: "RPC",
        ok: rpcOk,
        message: rpcOk
          ? `${coreResult.value.subversion || "Unknown"} · ${coreResult.value.chain} · ${coreResult.value.blocks.toLocaleString()} blocks`
          : ((coreResult as PromiseRejectedResult).reason as { message?: string })?.message ?? "Unreachable",
      },
      {
        label: "ZMQ",
        ok: zmqResult.status === "fulfilled" && zmqResult.value.reachable,
        message:
          zmqResult.status === "fulfilled"
            ? zmqResult.value.reachable
              ? `Port ${config.zmqPort} reachable`
              : (zmqResult.value.error ?? "Unreachable")
            : "Unreachable",
      },
    ]);
    setTestingRpc(false);
  }

  async function testTor() {
    setTestingTor(true);
    const [socksResult, torResult] = await Promise.allSettled([
      checkPort(RPC_HOST, config.torSocksPort),
      checkTor(config.torControlPort, config.torAuthPassword),
    ]);
    setTorRows([
      {
        label: "SOCKS Port",
        ok: socksResult.status === "fulfilled" && socksResult.value.reachable,
        message:
          socksResult.status === "fulfilled"
            ? socksResult.value.reachable
              ? `Port ${config.torSocksPort} reachable`
              : (socksResult.value.error ?? "Unreachable")
            : "Unreachable",
      },
      {
        label: "Control Port",
        ok: torResult.status === "fulfilled" && torResult.value.reachable && torResult.value.authenticated,
        message:
          torResult.status === "fulfilled"
            ? (torResult.value.error ?? (torResult.value.authenticated ? "Authenticated" : "Reachable"))
            : "Unreachable",
      },
    ]);
    setTestingTor(false);
  }

  async function handleSave() {
    saveConnectivityDefaults(config);
    pushToast("success", "Settings saved.");
    await testBitcoind();
    await testTor();
  }

  function handleResetConfirmed() {
    setConfig(HARDCODED_DEFAULTS);
    setRpcRows(null);
    setTorRows(null);
    setCoreStatus(null);
    setConfirmReset(false);
    pushToast("success", "Settings reset to defaults.");
  }

  async function copyZmqConfig() {
    const text = `zmqpubrawblock=tcp://127.0.0.1:${config.zmqPort}\nzmqpubrawtx=tcp://127.0.0.1:${config.zmqPort}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      pushToast("error", "Could not copy to clipboard.");
    }
  }

  function submitBackup() {
    setBackupError(undefined);
    if (!backupPassword) return setBackupError("Please enter a backup password.");
    if (backupPassword.length < 8) return setBackupError("Password must be at least 8 characters.");
    if (backupPassword !== backupConfirm) return setBackupError("Passwords do not match.");
    void performBackup(backupPassword);
  }

  async function performBackup(password: string) {
    const destinationPath = await save({
      defaultPath: `coinswap-wallet-backup-${new Date().toISOString().split("T")[0]}.json`,
      filters: [{ name: "JSON Files", extensions: ["json"] }],
    });
    if (!destinationPath) return;

    setBackingUp(true);
    try {
      await backupWallet(destinationPath, password);
      pushToast("success", `Backup created at ${destinationPath}`);
      setBackupOpen(false);
      setBackupPassword("");
      setBackupConfirm("");
    } catch (e) {
      pushToast("error", `Backup failed: ${(e as { message?: string })?.message ?? "unknown error"}`);
    } finally {
      setBackingUp(false);
    }
  }

  return (
    <div className="p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-bold leading-none tracking-tight text-foreground">Settings</h1>
          <p className="mt-2 font-mono text-[10.5px] uppercase tracking-widest text-subtle">Wallet &amp; Network</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => setConfirmReset(true)}>
            Reset to Defaults
          </Button>
          <Button onClick={() => void handleSave()}>
            <Save size={14} strokeWidth={2} /> Save Settings
          </Button>
        </div>
      </header>

      <div className="mt-6 flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
        {/* Wallet backup */}
        <section className="p-6">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-subtle">
            <SectionDot color="bg-warning" />
            Wallet Backup
          </div>
          <p className="mt-2.5 max-w-2xl text-[13px] leading-relaxed text-muted">
            Export your wallet to an encrypted backup file. This is useful for recovering the wallet or migrating it
            to other Coinswap clients.
          </p>
          <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 text-[12.5px] leading-relaxed text-subtle">
            <li>Wallet Backup is an encrypted JSON file that contains all wallet data and swap histories.</li>
            <li>Use it to recover this wallet or migrate it to another Coinswap client.</li>
            <li>Recommended to use a strong password for the backup file.</li>
            <li>Use the same password while restoring wallet from backup.</li>
          </ul>

          {!backupOpen ? (
            <Button className="mt-4 w-full justify-center" onClick={() => setBackupOpen(true)}>
              <Save size={15} strokeWidth={2} /> Create Backup
            </Button>
          ) : (
            <div className="mt-4">
              <div className="grid grid-cols-2 gap-3">
                <PasswordField
                  label="Backup Password"
                  placeholder="Enter password"
                  value={backupPassword}
                  onChange={(e) => setBackupPassword(e.target.value)}
                />
                <PasswordField
                  label="Confirm Password"
                  placeholder="Re-enter password"
                  value={backupConfirm}
                  onChange={(e) => setBackupConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitBackup()}
                />
              </div>
              {backupError && <p className="mt-2 text-[12px] text-danger">{backupError}</p>}
              <Button className="mt-3 w-full justify-center" onClick={submitBackup} loading={backingUp}>
                <Check size={14} strokeWidth={2} /> Confirm &amp; Create Backup
              </Button>
            </div>
          )}
        </section>

        {/* Connection status */}
        <section className="p-6">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-subtle">
            <span className={`h-1.5 w-1.5 rounded-full ${coreStatus ? "bg-success" : "bg-subtle/40"}`} />
            Connection Status
            <span className={`ml-1 font-semibold ${coreStatus ? "text-success" : "text-danger"}`}>
              {coreStatus ? "Connected" : "Not Connected"}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3">
            {[
              ["Bitcoin Version", coreStatus?.subversion || "--"],
              ["Network", coreStatus?.chain ?? "--"],
              ["Block Height", coreStatus ? coreStatus.blocks.toLocaleString() : "--"],
              ["Sync Progress", coreStatus ? `${(coreStatus.verificationProgress * 100).toFixed(1)}%` : "--"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-line bg-surface-raised px-3.5 py-3">
                <span className="block text-[11px] text-subtle">{label}</span>
                <strong className="mt-1 block font-mono text-[13px] text-foreground">{value}</strong>
              </div>
            ))}
          </div>
        </section>

        {/* Bitcoin Core RPC */}
        <section className="p-6">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-subtle">
            <SectionDot />
            Bitcoin Core RPC
          </div>
          <div className="mt-3 grid grid-cols-2 gap-6">
            <div>
              <div className="grid grid-cols-2 gap-3">
                <TextField label="RPC Host" value={RPC_HOST} disabled />
                <TextField
                  label="RPC Port"
                  type="text"
                  inputMode="numeric"
                  value={config.rpcPort}
                  onChange={(e) => setConfig((c) => ({ ...c, rpcPort: Number(e.target.value) || 0 }))}
                />
                <TextField
                  label="RPC Username"
                  value={config.rpcUsername}
                  onChange={(e) => setConfig((c) => ({ ...c, rpcUsername: e.target.value }))}
                />
                <PasswordField
                  label="RPC Password"
                  placeholder="Enter RPC password"
                  value={config.rpcPassword}
                  onChange={(e) => setConfig((c) => ({ ...c, rpcPassword: e.target.value }))}
                />
              </div>
              <div className="mt-3">
                <TextField
                  label="ZMQ Port"
                  type="text"
                  inputMode="numeric"
                  value={config.zmqPort}
                  onChange={(e) => setConfig((c) => ({ ...c, zmqPort: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Button size="sm" variant="ghost" onClick={() => void testBitcoind()} loading={testingRpc}>
                  Test Bitcoind
                </Button>
              </div>
              {rpcRows && <TestResultRows rows={rpcRows} />}
            </div>

            <div>
              <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-subtle">
                bitcoin.conf snippet
                <span className="text-subtle">Read-only</span>
              </div>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-line bg-surface-raised p-3 font-mono text-[12px] text-muted">
                {`zmqpubrawblock=tcp://127.0.0.1:${config.zmqPort}\nzmqpubrawtx=tcp://127.0.0.1:${config.zmqPort}`}
              </pre>
              <Button variant="ghost" size="sm" className="mt-2.5 w-full justify-center" onClick={() => void copyZmqConfig()}>
                {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={2} />}
                {copied ? "Copied!" : "Copy ZMQ Config"}
              </Button>
              <button
                type="button"
                onClick={() => void openUrl(BITCOIN_GUIDE_URL)}
                className="mt-2.5 flex w-full items-center justify-between rounded-lg border border-line px-3 py-2.5 text-[12.5px] text-primary transition-colors hover:border-line-strong hover:text-primary-hover"
              >
                <span className="flex items-center gap-1.5">
                  <ExternalLink size={14} strokeWidth={2} /> Bitcoin Core setup guide
                </span>
                <span className="font-mono text-[10.5px] uppercase tracking-widest text-subtle">coinswap docs →</span>
              </button>
            </div>
          </div>
        </section>

        {/* Tor */}
        <section className="p-6">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-subtle">
            <SectionDot color="bg-[#b990ff]" />
            Tor
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <TextField
              label="Control Port"
              type="text"
              inputMode="numeric"
              value={config.torControlPort}
              onChange={(e) => setConfig((c) => ({ ...c, torControlPort: Number(e.target.value) || 0 }))}
            />
            <TextField
              label="SOCKS Port"
              type="text"
              inputMode="numeric"
              value={config.torSocksPort}
              onChange={(e) => setConfig((c) => ({ ...c, torSocksPort: Number(e.target.value) || 0 }))}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-[12.5px] font-medium text-muted">Auth Password</label>
              <div className="relative">
                <input
                  type={torPasswordVisible ? "text" : "password"}
                  placeholder="Optional"
                  value={config.torAuthPassword}
                  onChange={(e) => setConfig((c) => ({ ...c, torAuthPassword: e.target.value }))}
                  className="h-10 w-full rounded-sm border border-line bg-surface-raised px-3 pr-10 text-[13px] text-foreground outline-none transition-colors placeholder:text-subtle focus:border-line-strong"
                />
                <button
                  type="button"
                  onClick={() => setTorPasswordVisible((v) => !v)}
                  aria-label={torPasswordVisible ? "Hide password" : "Show password"}
                  className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-subtle hover:text-muted"
                >
                  {torPasswordVisible ? <EyeOff size={16} strokeWidth={1.6} /> : <Eye size={16} strokeWidth={1.6} />}
                </button>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Button size="sm" variant="ghost" onClick={() => void testTor()} loading={testingTor}>
              Test Tor
            </Button>
          </div>
          {torRows && <TestResultRows rows={torRows} />}
        </section>
      </div>

      {confirmReset && (
        <Modal
          title="Reset all settings?"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
              <Button onClick={handleResetConfirmed}>Reset</Button>
            </>
          }
        >
          <p className="text-[13px] text-muted">
            This resets RPC and Tor connection settings on this screen back to their defaults. It does not affect
            your wallet or funds.
          </p>
        </Modal>
      )}
    </div>
  );
}
