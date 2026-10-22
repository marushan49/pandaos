import { useEffect } from "react";
import { useSessionStore } from "@/stores/session-store";
import {
  collectAllTabs,
  findPaneContainingTab,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import { selectWorkspaceMainAgentId } from "@/utils/workspace-agent-activity";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";

export function useFinishedAgentTabsToFront(input: {
  serverId: string;
  workspaceId: string;
}): void {
  const { serverId, workspaceId } = input;
  const mainAgentId = useSessionStore((state) =>
    selectWorkspaceMainAgentId(state.sessions[serverId]?.agents, workspaceId),
  );
  useEffect(() => {
    if (!mainAgentId) return undefined;
    const keepMainTabFirst = () =>
      moveAgentTabToFront({ serverId, workspaceId, agentId: mainAgentId });
    keepMainTabFirst();
    return useWorkspaceLayoutStore.subscribe(keepMainTabFirst);
  }, [mainAgentId, serverId, workspaceId]);
  useEffect(() => {
    if (!workspaceId) return undefined;
    const previousStatus = new Map<string, string>();
    const snapshot = useSessionStore.getState().sessions[serverId]?.agents;
    for (const agent of snapshot?.values() ?? []) previousStatus.set(agent.id, agent.status);
    return useSessionStore.subscribe((state) => {
      const agents = state.sessions[serverId]?.agents;
      if (!agents) return;
      for (const agent of agents.values()) {
        const before = previousStatus.get(agent.id);
        previousStatus.set(agent.id, agent.status);
        if (before === "running" && agent.status === "idle")
          moveAgentTabToFront({ serverId, workspaceId, agentId: agent.id });
      }
    });
  }, [serverId, workspaceId]);
}

export function moveAgentTabToFront(input: {
  serverId: string;
  workspaceId: string;
  agentId: string;
}): void {
  const workspaceKey = buildWorkspaceTabPersistenceKey({
    serverId: input.serverId,
    workspaceId: input.workspaceId,
  });
  const store = useWorkspaceLayoutStore.getState();
  const layout = workspaceKey ? store.layoutByWorkspace[workspaceKey] : null;
  if (!workspaceKey || !layout) return;
  const tabs = collectAllTabs(layout.root);
  const tabIdOf = (agentId: string | null) =>
    tabs.find((tab) => tab.target.kind === "agent" && tab.target.agentId === agentId)?.tabId;
  const tabId = tabIdOf(input.agentId);
  const pane = tabId ? findPaneContainingTab(layout.root, tabId) : null;
  if (!tabId || !pane) return;
  const mainAgentId = selectWorkspaceMainAgentId(
    useSessionStore.getState().sessions[input.serverId]?.agents,
    input.workspaceId,
  );
  const mainTabId = tabIdOf(mainAgentId);
  const head =
    mainTabId && mainTabId !== tabId && pane.tabIds.includes(mainTabId)
      ? [mainTabId, tabId]
      : [tabId];
  const order = [...head, ...pane.tabIds.filter((id) => !head.includes(id))];
  if (order.every((id, index) => id === pane.tabIds[index])) return;
  store.reorderTabsInPane(workspaceKey, pane.id, order);
}
