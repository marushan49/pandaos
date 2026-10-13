import { useHosts, useHostRuntimeSnapshot } from "@/runtime/host-runtime";
import { useQuery } from "@tanstack/react-query";
import { getDesktopHost, type DesktopEditorBridge } from "@/desktop/host";

export type DesktopOpenTargetKind = "editor" | "file-manager";
export type DesktopOpenTargetIcon =
  | { kind: "image"; dataUrl: string }
  | { kind: "symbol"; name: "folder" | "terminal" };

export interface DesktopOpenTarget {
  id: string;
  label: string;
  kind: DesktopOpenTargetKind;
  icon: DesktopOpenTargetIcon;
}

export interface OpenDesktopTargetInput {
  editorId: string;
  workspacePath: string;
  remoteSshHost?: string;
  filePath?: string;
  line?: number;
  column?: number;
}

interface AvailableDesktopEditorBridge {
  listTargets: NonNullable<DesktopEditorBridge["listTargets"]>;
  openTarget: NonNullable<DesktopEditorBridge["openTarget"]>;
}

interface SelectDesktopOpenTargetsInput {
  canListTargets: boolean;
  targets: DesktopOpenTarget[] | undefined;
}

export function selectDesktopOpenTargets({
  canListTargets,
  targets,
}: SelectDesktopOpenTargetsInput): DesktopOpenTarget[] {
  if (!canListTargets) {
    return [];
  }
  return targets ?? [];
}

function getDesktopEditorBridge(): AvailableDesktopEditorBridge | null {
  const bridge = getDesktopHost()?.editor;
  if (!bridge?.listTargets || !bridge.openTarget) {
    return null;
  }
  return {
    listTargets: bridge.listTargets,
    openTarget: bridge.openTarget,
  };
}

export function hasDesktopOpenTargetsBridge(): boolean {
  return getDesktopEditorBridge() !== null;
}

export async function listDesktopOpenTargets(): Promise<DesktopOpenTarget[]> {
  const bridge = getDesktopEditorBridge();
  if (!bridge) {
    return [];
  }
  return await bridge.listTargets();
}

export async function openDesktopTarget(input: OpenDesktopTargetInput): Promise<void> {
  const bridge = getDesktopEditorBridge();
  if (!bridge) {
    throw new Error("Desktop editor bridge is unavailable");
  }
  await bridge.openTarget(input);
}

export function useDesktopOpenTargets(input: { isLocalExecution: boolean; serverId?: string }) {
  const hasBridge = hasDesktopOpenTargetsBridge();
  const hosts = useHosts();
  const snapshot = useHostRuntimeSnapshot(input.serverId ?? "");
  const host = hosts.find((candidate) => candidate.serverId === input.serverId);
  const sshConnections =
    host?.connections.filter((connection) => connection.type === "remoteSsh") ?? [];
  const sshConnection =
    sshConnections.find((connection) => connection.id === snapshot?.activeConnectionId) ??
    sshConnections.find((connection) => connection.id === host?.preferredConnectionId) ??
    sshConnections[0];
  const remoteSshHost =
    !input.isLocalExecution &&
    sshConnection &&
    (!sshConnection.sshPort || sshConnection.sshPort === 22)
      ? sshConnection.host
      : undefined;
  const canListTargets = hasBridge && (input.isLocalExecution || Boolean(remoteSshHost));
  const query = useQuery({
    queryKey: ["desktop-open-targets"],
    enabled: canListTargets,
    staleTime: 60_000,
    retry: false,
    queryFn: listDesktopOpenTargets,
  });
  const targets = selectDesktopOpenTargets({
    canListTargets,
    targets: query.data,
  });

  return {
    targets: remoteSshHost ? targets.filter((target) => target.id === "vscode") : targets,
    remoteSshHost,
    isAvailable: canListTargets,
  };
}
