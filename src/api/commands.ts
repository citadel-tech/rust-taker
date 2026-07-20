// The single typed boundary to the backend. Components never call invoke()
// directly — they import from here so command names/shapes live in one place.

import { invoke } from "@tauri-apps/api/core";
import type { CoreStatus, PortStatus, RpcSettings, VersionInfo } from "./types";

export function checkPort(
  host: string,
  port: number,
  timeoutMs?: number,
): Promise<PortStatus> {
  return invoke("check_port", { host, port, timeoutMs });
}

export function checkBitcoinCore(rpc: RpcSettings): Promise<CoreStatus> {
  return invoke("check_bitcoin_core", { rpc });
}

export function getVersionInfo(): Promise<VersionInfo> {
  return invoke("get_version_info");
}
