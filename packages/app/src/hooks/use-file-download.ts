import { useCallback, useMemo } from "react";
import { i18n } from "@/i18n/i18next";
import { useSessionStore } from "@/stores/session-store";
import { useDownloadStore } from "@/stores/download-store";

interface UseFileDownloadParams {
  serverId: string;
  workspaceId?: string | null;
  workspaceRoot: string;
}

export function useFileDownload({
  serverId,
  workspaceId,
  workspaceRoot,
}: UseFileDownloadParams): (input: { fileName: string; path: string }) => void {
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const normalizedWorkspaceRoot = useMemo(() => workspaceRoot.trim(), [workspaceRoot]);
  const workspaceScopeId = useMemo(
    () => workspaceId?.trim() || normalizedWorkspaceRoot,
    [normalizedWorkspaceRoot, workspaceId],
  );
  const startDownload = useDownloadStore((state) => state.startDownload);

  return useCallback(
    ({ fileName, path }) => {
      if (!workspaceScopeId) {
        return;
      }
      void startDownload({
        serverId,
        scopeId: workspaceScopeId,
        fileName,
        path,
        readFile: async (targetPath) => {
          if (!client) throw new Error(i18n.t("downloads.hostUnavailable"));
          return client.readFile(normalizedWorkspaceRoot, targetPath);
        },
      });
    },
    [client, normalizedWorkspaceRoot, serverId, startDownload, workspaceScopeId],
  );
}
