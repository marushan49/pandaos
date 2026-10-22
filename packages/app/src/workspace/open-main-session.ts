import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import { selectWorkspaceMainAgentId } from "@/utils/workspace-agent-activity";

export function navigateToWorkspaceMainSession(input: {
  serverId: string;
  workspaceId: string;
}): void {
  const agentId = selectWorkspaceMainAgentId(
    useSessionStore.getState().sessions[input.serverId]?.agents,
    input.workspaceId,
  );
  navigateToWorkspace({
    serverId: input.serverId,
    workspaceId: input.workspaceId,
    ...(agentId ? { target: { kind: "agent" as const, agentId } } : {}),
  });
}
