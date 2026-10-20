import { Platform } from "react-native";
import { isElectronRuntime, isElectronRuntimeMac } from "@/desktop/host";

export const isWeb = Platform.OS === "web";

export const isNative = Platform.OS !== "web";

export const isDev = Boolean((globalThis as { __DEV__?: boolean }).__DEV__);

let _isElectronCached: boolean | null = null;
let _isElectronMacCached: boolean | null = null;

export function getIsElectron(): boolean {
  if (_isElectronCached === true) return true;
  if (!isWeb) return false;
  const result = isElectronRuntime();
  if (result) _isElectronCached = true;
  return result;
}

export function getIsElectronMac(): boolean {
  if (_isElectronMacCached === true) return true;
  if (!isWeb) return false;
  const result = isElectronRuntimeMac();
  if (result) _isElectronMacCached = true;
  return result;
}
