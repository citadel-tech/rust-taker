import { open } from "@tauri-apps/plugin-dialog";
import { dirname } from "@tauri-apps/api/path";
import { FolderOpen, FolderPlus, Plus } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { checkBitcoinCore, checkTor, initTaker, listWallets, restoreWallet } from "../../api/commands";
import type { AppError, InitResult } from "../../api/types";
import { Modal, StatusRow, WalletCard, type CheckState } from "../../components/ui/display";
import { Button, PasswordField, TextField } from "../../components/ui/inputs";
import { Headline } from "../../components/ui/layout";
import { wait, withMinDelay } from "../../lib/timing";
import {
  RPC_HOST,
  loadConnectivityDefaults,
  saveConnectivityDefaults,
  type ConnectivityConfig,
} from "../../lib/connectivity";
import {
  getDefaultDataDir,
  getDefaultWalletsDir,
  loadDataDir,
  saveDataDir,
  type WalletChoice,
} from "./types";

interface SelectWalletStepProps {
  onSuccess: (result: InitResult) => void;
}

type ViewMode = "grid" | "unlock" | "create" | "checking";
type CheckStage = "rpc" | "tor" | "wallet";

interface CheckFailure {
  stage: CheckStage;
  message: string;
}

interface Steps {
  rpc: CheckState;
  tor: CheckState;
  verify: CheckState;
  init: CheckState;
}

const IDLE_STEPS: Steps = { rpc: "idle", tor: "idle", verify: "idle", init: "idle" };

function randomWalletName() {
  return `taker-wallet-${Math.floor(100000 + Math.random() * 900000)}`;
}

function basename(path: string) {
  return path.split(/[/\\]/).pop() ?? path;
}

function isAppError(e: unknown): e is AppError {
  return typeof e === "object" && e !== null && "code" in e;
}

// Local checks (RPC/Tor/wallet unlock) often resolve in well under 100ms,
// which makes the sequential checklist flash by unreadably.
const MIN_STEP_MS = 900;

function onEnter(fn: () => void) {
  return (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") fn();
  };
}

export function SelectWalletStep({ onSuccess }: SelectWalletStepProps) {
  const [dataDir, setDataDir] = useState<string | undefined>(loadDataDir);
  const [wallets, setWallets] = useState<string[]>([]);
  const [loadingWallets, setLoadingWallets] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [unlockPassword, setUnlockPassword] = useState("");

  const [createName, setCreateName] = useState(randomWalletName());
  const [createPassword, setCreatePassword] = useState("");
  const [createConfirm, setCreateConfirm] = useState("");
  const [createError, setCreateError] = useState<string | undefined>();

  const [connectivity, setConnectivity] = useState<ConnectivityConfig>(loadConnectivityDefaults);
  const [steps, setSteps] = useState<Steps>(IDLE_STEPS);
  const [failure, setFailure] = useState<CheckFailure | null>(null);
  const [pendingWallet, setPendingWallet] = useState<WalletChoice | null>(null);
  const [retryPassword, setRetryPassword] = useState("");

  useEffect(() => {
    refreshWallets(dataDir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshWallets(dir?: string) {
    setLoadingWallets(true);
    try {
      setWallets(await listWallets(dir));
    } finally {
      setLoadingWallets(false);
    }
  }

  function selectWallet(name: string) {
    setSelectedWallet(name);
    setUnlockPassword("");
    setViewMode("unlock");
  }

  async function changeLocation() {
    const path = await open({ directory: true, defaultPath: dataDir ?? (await getDefaultDataDir()) });
    if (typeof path !== "string") return;
    setDataDir(path);
    saveDataDir(path);
    refreshWallets(path);
  }

  async function loadWalletFile() {
    const path = await open({ multiple: false, defaultPath: dataDir ?? (await getDefaultWalletsDir()) });
    if (typeof path !== "string") return;
    // Wallet files live at <data_dir>/wallets/<name> — if this file is
    // outside the current data dir, adopt its parent as the new data dir.
    const walletsDir = await dirname(path);
    const newDataDir = await dirname(walletsDir);
    setDataDir(newDataDir);
    saveDataDir(newDataDir);
    selectWallet(basename(path));
  }

  function submitCreate() {
    if (!createName.trim()) return setCreateError("Wallet name is required.");
    if (createPassword.length < 8) return setCreateError("Password must be at least 8 characters.");
    if (createPassword !== createConfirm) return setCreateError("Passwords don't match.");
    setCreateError(undefined);
    runChecks({ mode: "create", walletName: createName.trim(), password: createPassword });
  }

  function submitUnlock() {
    if (!selectedWallet) return;
    runChecks({ mode: "load", walletName: selectedWallet, password: unlockPassword });
  }

  async function runChecks(wallet: WalletChoice) {
    setPendingWallet(wallet);
    setFailure(null);
    setViewMode("checking");
    setSteps({ rpc: "running", tor: "idle", verify: "idle", init: "idle" });

    const rpc = {
      host: RPC_HOST,
      port: connectivity.rpcPort,
      username: connectivity.rpcUsername,
      password: connectivity.rpcPassword,
    };

    try {
      await withMinDelay(checkBitcoinCore(rpc), MIN_STEP_MS);
    } catch (e) {
      setSteps((s) => ({ ...s, rpc: "failed" }));
      setFailure({ stage: "rpc", message: (e as { message?: string })?.message ?? "Could not reach Bitcoin Core." });
      return;
    }
    setSteps((s) => ({ ...s, rpc: "passed", tor: "running" }));

    try {
      await withMinDelay(
        (async () => {
          const status = await checkTor(connectivity.torControlPort, connectivity.torAuthPassword);
          if (!(status.reachable && status.authenticated)) {
            throw new Error(status.error ?? "Tor control port unreachable.");
          }
        })(),
        MIN_STEP_MS,
      );
    } catch (e) {
      setSteps((s) => ({ ...s, tor: "failed" }));
      setFailure({ stage: "tor", message: (e as { message?: string })?.message ?? "Could not reach Tor." });
      return;
    }
    setSteps((s) => ({ ...s, tor: "passed", verify: "running" }));
    await wait(MIN_STEP_MS);
    setSteps((s) => ({ ...s, verify: "passed", init: "running" }));

    try {
      const result = await withMinDelay(
        (async () => {
          if (wallet.mode === "restore") {
            await restoreWallet(wallet.walletName, rpc, wallet.backupFilePath, wallet.password, dataDir);
          }
          return initTaker({
            walletName: wallet.walletName,
            walletPassword: wallet.password,
            rpc,
            zmqAddr: `tcp://${RPC_HOST}:${connectivity.zmqPort}`,
            controlPort: connectivity.torControlPort,
            socksPort: connectivity.torSocksPort,
            torAuthPassword: connectivity.torAuthPassword,
            connectionType: "tor",
            dataDir,
          });
        })(),
        MIN_STEP_MS,
      );
      setSteps((s) => ({ ...s, init: "passed" }));
      saveConnectivityDefaults(connectivity);
      onSuccess(result);
    } catch (e) {
      const err = isAppError(e) ? e : null;
      setSteps((s) => ({ ...s, verify: "failed", init: "failed" }));
      setFailure({
        stage: "wallet",
        message:
          err?.code === "WALLET_WRONG_PASSWORD" ? "Incorrect password. Try again." : (err?.message ?? "Something went wrong."),
      });
    }
  }

  function retry() {
    if (!pendingWallet) return;
    if (failure?.stage === "wallet") {
      runChecks({ ...pendingWallet, password: retryPassword });
    } else {
      runChecks(pendingWallet);
    }
  }

  function cancelFailure() {
    setFailure(null);
    setViewMode(pendingWallet?.mode === "create" ? "create" : "unlock");
  }

  return (
    <div className="p-8 text-center">
      <div>
        <Headline text="Select your" accent="wallet." />
        <p className="mx-auto mt-2 max-w-lg text-[13.5px] text-muted">
          Pick a wallet to unlock, or create a new one to get started.
        </p>
      </div>

      {viewMode === "grid" && (
        <div className="mt-8">
          {loadingWallets ? (
            <p className="text-[13px] text-muted">Looking for wallets…</p>
          ) : wallets.length === 0 ? (
            <div className="rounded-card border border-dashed border-line-strong px-8 py-10 text-center">
              <p className="text-[14px] font-medium text-foreground">No wallets found</p>
              <p className="mt-1 text-[12.5px] text-muted">
                Create a new wallet to get started, or point the app at a different folder.
              </p>
              <Button className="mt-5" onClick={() => setViewMode("create")}>
                Create new wallet
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-4">
              {wallets.map((name) => (
                <WalletCard key={name} name={name} onClick={() => selectWallet(name)} />
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 border-t border-line pt-5">
            <Button variant="secondary" size="sm" onClick={changeLocation}>
              <FolderOpen size={14} strokeWidth={1.8} />
              Change location
            </Button>
            <Button variant="secondary" size="sm" onClick={loadWalletFile}>
              <FolderPlus size={14} strokeWidth={1.8} />
              Load wallet
            </Button>
            {wallets.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setViewMode("create")}>
                <Plus size={14} strokeWidth={1.8} />
                Create new wallet
              </Button>
            )}
          </div>
          {dataDir && <p className="mt-3 text-[11.5px] text-subtle">{dataDir}/wallets</p>}
        </div>
      )}

      {viewMode === "unlock" && selectedWallet && (
        <div className="mx-auto mt-8 max-w-sm">
          <p className="text-[14px] font-semibold text-foreground">{selectedWallet}</p>
          <div className="mt-4">
            <PasswordField
              label="Password"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              onKeyDown={onEnter(() => unlockPassword && submitUnlock())}
              placeholder="Enter wallet password"
              autoFocus
            />
          </div>
          <div className="mt-5 flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setViewMode("grid")}>
              Back
            </Button>
            <Button className="flex-1" disabled={!unlockPassword} onClick={submitUnlock}>
              Unlock
            </Button>
          </div>
        </div>
      )}

      {viewMode === "create" && (
        <div className="mx-auto mt-8 max-w-sm">
          <p className="text-[14px] font-semibold text-foreground">Create new wallet</p>
          <div className="mt-4 flex flex-col gap-4">
            <TextField
              label="Wallet name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
            />
            <PasswordField
              label="Password"
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              hint="At least 8 characters. An unencrypted wallet is not permitted — losing this password means losing access to funds."
            />
            <PasswordField
              label="Confirm password"
              value={createConfirm}
              onChange={(e) => setCreateConfirm(e.target.value)}
              onKeyDown={onEnter(submitCreate)}
              error={createError}
            />
          </div>
          <div className="mt-5 flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setViewMode("grid")}>
              Back
            </Button>
            <Button className="flex-1" onClick={submitCreate}>Create &amp; continue</Button>
          </div>
        </div>
      )}

      {viewMode === "checking" && (
        <div className="mx-auto mt-8 flex max-w-sm flex-col gap-2.5">
          <StatusRow label="Checking Bitcoin Core" state={steps.rpc} />
          <StatusRow label="Checking Tor" state={steps.tor} />
          <StatusRow label="Verifying wallet password" state={steps.verify} />
          <StatusRow label="Initializing taker" state={steps.init} />
        </div>
      )}

      {failure && (
        <Modal
          title={
            failure.stage === "rpc"
              ? "Can't reach Bitcoin Core"
              : failure.stage === "tor"
                ? "Can't reach Tor"
                : "Couldn't unlock wallet"
          }
          onClose={cancelFailure}
          footer={
            <>
              <Button variant="secondary" onClick={cancelFailure}>
                Cancel
              </Button>
              <Button onClick={retry}>Retry</Button>
            </>
          }
        >
          <p className="text-[12.5px] text-danger">{failure.message}</p>

          {failure.stage === "rpc" && (
            <>
              <TextField
                label="Port"
                value={connectivity.rpcPort}
                onChange={(e) => setConnectivity((c) => ({ ...c, rpcPort: Number(e.target.value) }))}
              />
              <TextField
                label="Username"
                value={connectivity.rpcUsername}
                onChange={(e) => setConnectivity((c) => ({ ...c, rpcUsername: e.target.value }))}
              />
              <PasswordField
                label="Password"
                value={connectivity.rpcPassword}
                onChange={(e) => setConnectivity((c) => ({ ...c, rpcPassword: e.target.value }))}
                onKeyDown={onEnter(retry)}
              />
            </>
          )}

          {failure.stage === "tor" && (
            <>
              <TextField
                label="SOCKS port"
                value={connectivity.torSocksPort}
                onChange={(e) => setConnectivity((c) => ({ ...c, torSocksPort: Number(e.target.value) }))}
              />
              <TextField
                label="Control port"
                value={connectivity.torControlPort}
                onChange={(e) => setConnectivity((c) => ({ ...c, torControlPort: Number(e.target.value) }))}
              />
              <PasswordField
                label="Control port auth password (optional)"
                value={connectivity.torAuthPassword}
                onChange={(e) => setConnectivity((c) => ({ ...c, torAuthPassword: e.target.value }))}
                onKeyDown={onEnter(retry)}
              />
            </>
          )}

          {failure.stage === "wallet" && (
            <PasswordField
              label="Password"
              value={retryPassword}
              onChange={(e) => setRetryPassword(e.target.value)}
              onKeyDown={onEnter(retry)}
              placeholder="Enter wallet password"
              autoFocus
            />
          )}
        </Modal>
      )}
    </div>
  );
}
