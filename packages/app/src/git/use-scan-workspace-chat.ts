import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { collectAgentTranscript } from "@/agent-transcript/collect";
import { pullRequestCurationStore } from "@/git/pull-request-curation-store";
import { resolvePullRequestForAttach } from "@/git/use-attach-pull-request";
import type { ForgeSearchClient } from "@/git/use-forge-search-query";
import { scanTranscriptForPullRequests, type ScanRepository } from "@/git/scan-workspace-chat";
import type { ScanChatFinding } from "@/git/scan-chat-dialog";
import type { RelatedPullRequest } from "@/git/related-pull-requests";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useWorkspace } from "@/stores/session-store-hooks";
import { useSessionStore } from "@/stores/session-store";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useToast } from "@/contexts/toast-api-context";

interface UseScanWorkspaceChatInput {
  serverId?: string;
  workspaceId?: string;
  workspaceKey: string;
  pullRequests?: readonly RelatedPullRequest[];
}

const SCAN_MAX_ENTRIES = 1500;
const SCAN_MAX_PAGES = 8;

export interface ScanWorkspaceChatResult {
  findings: ScanChatFinding[];
  unresolved: number[];
}

export function useScanWorkspaceChat(input: UseScanWorkspaceChatInput): {
  scanChat: () => Promise<ScanWorkspaceChatResult | null>;
  scanning: boolean;
} {
  const { t } = useTranslation();
  const toast = useToast();
  const [scanning, setScanning] = useState(false);
  const client = useHostRuntimeClient(input.serverId ?? "");
  const selection = useActiveWorkspaceSelection();
  const sourceClient = useHostRuntimeClient(selection?.serverId ?? "");
  const workspace = useWorkspace(input.serverId ?? null, input.workspaceId ?? null);
  const repo = useMemo(() => repositoryOf(input.pullRequests), [input.pullRequests]);

  const scanChat = useCallback(async (): Promise<ScanWorkspaceChatResult | null> => {
    if (!client || !workspace?.workspaceDirectory) {
      toast.error(t("workspace.terminal.hostDisconnected"));
      return null;
    }
    const agentId = selection
      ? useSessionStore.getState().sessions[selection.serverId]?.focusedAgentId
      : null;
    if (!agentId || !sourceClient) {
      toast.error(t("workspace.git.pr.set.scanChatNoAgent"));
      return null;
    }
    setScanning(true);
    try {
      const searchClient: ForgeSearchClient = {
        searchForge: (options) => client.searchForge(options),
      };
      const transcript = await collectAgentTranscript({
        fetchPage: (options) => sourceClient.fetchAgentTimeline(agentId, options),
        maxEntries: SCAN_MAX_ENTRIES,
        maxPages: SCAN_MAX_PAGES,
        maxRestarts: 0,
      });
      const scan = await scanTranscriptForPullRequests({
        entries: transcript.entries,
        repo,
        resolveNumber: async (number) =>
          resolvePullRequestForAttach({
            client: searchClient,
            cwd: workspace.workspaceDirectory,
            number,
          }).catch(() => null),
      });
      if (scan.found.length === 0) {
        toast.show(
          scan.unresolved.length > 0
            ? t("workspace.git.pr.set.scanChatUnresolved", { numbers: scan.unresolved.join(", ") })
            : t("workspace.git.pr.set.scanChatEmpty"),
        );
        return null;
      }
      const byNumber = new Map(scan.candidates.map((entry) => [entry.number, entry.mentions]));
      return {
        findings: scan.found.map((pullRequest) => ({
          pullRequest,
          mentions: byNumber.get(pullRequest.number) ?? 0,
        })),
        unresolved: scan.unresolved,
      };
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setScanning(false);
    }
  }, [client, sourceClient, selection, repo, workspace, t, toast]);

  return { scanChat, scanning };
}

export function attachScannedPullRequests(
  workspaceKey: string,
  pullRequests: readonly RelatedPullRequest[],
): void {
  for (const facts of pullRequests) {
    pullRequestCurationStore.attach(workspaceKey, facts);
  }
}

function repositoryOf(
  pullRequests: readonly RelatedPullRequest[] | undefined,
): ScanRepository | null {
  for (const pullRequest of pullRequests ?? []) {
    const match = /https?:\/\/[^\s/]+\/([^\s/]+)\/([^\s/]+)\/pull\//.exec(pullRequest.url);
    const owner = match?.[1];
    const name = match?.[2];
    if (owner && name) {
      return { owner, name };
    }
  }
  return null;
}
