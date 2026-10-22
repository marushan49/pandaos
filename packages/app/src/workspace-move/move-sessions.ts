import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { useSidebarOrderStore } from "@/stores/sidebar-order-store";
import {
  collectAllTabs,
  findPaneContainingTab,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { normalizeWorkspaceDescriptor, useSessionStore } from "@/stores/session-store";
import {
  isWorkspaceDropTarget,
  type ProjectDropTarget,
  type SidebarDropTarget,
} from "./drop-target";

export interface MoveWorkspaceSessionsResult {
  moved: number;
}

export interface WorkspaceMovePlan {
  sessions: number;
  source: string;
  target: string;
}

export async function createProjectWorkspace(input: {
  target: ProjectDropTarget;
  title: string | null;
}): Promise<string> {
  const { serverId, projectId, cwd } = input.target;
  const client = getHostRuntimeStore().getClient(serverId);
  if (!client) throw new Error("The host is not connected");
  const payload = await client.createWorkspace({
    source: { kind: "directory", path: cwd, projectId },
    ...(input.title ? { title: input.title } : {}),
  });
  if (payload.error || !payload.workspace) {
    throw new Error(payload.error ?? "The workspace was not created");
  }
  getHostRuntimeStore().acceptWorkspaceSnapshots(serverId, [
    normalizeWorkspaceDescriptor(payload.workspace),
  ]);
  return payload.workspace.id;
}

export async function moveWorkspaceSessions(input: {
  serverId: string;
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
}): Promise<MoveWorkspaceSessionsResult> {
  const { serverId, sourceWorkspaceId, targetWorkspaceId } = input;
  const client = getHostRuntimeStore().getClient(serverId);
  if (!client) throw new Error("The host is not connected");
  const agentIds = openAgentIds(serverId, sourceWorkspaceId);
  for (const agentId of agentIds.toReversed()) {
    await moveSessionToWorkspace({ serverId, agentId, targetWorkspaceId, navigate: false });
  }
  const [first] = agentIds;
  navigateToWorkspace({
    serverId,
    workspaceId: targetWorkspaceId,
    ...(first ? { target: { kind: "agent", agentId: first } } : {}),
  });
  return { moved: agentIds.length };
}

export async function moveSessionToWorkspace(input: {
  serverId: string;
  agentId: string;
  targetWorkspaceId: string;
  navigate?: boolean;
}): Promise<void> {
  const client = getHostRuntimeStore().getClient(input.serverId);
  if (!client) throw new Error("The host is not connected");
  const sourceWorkspaceId = useSessionStore
    .getState()
    .sessions[input.serverId]?.agents.get(input.agentId)?.workspaceId;
  await client.moveAgentToWorkspace(input.agentId, input.targetWorkspaceId);
  const store = useWorkspaceLayoutStore.getState();
  if (sourceWorkspaceId && sourceWorkspaceId !== input.targetWorkspaceId) {
    const sourceKey = buildWorkspaceTabPersistenceKey({
      serverId: input.serverId,
      workspaceId: sourceWorkspaceId,
    });
    const sourceLayout = sourceKey ? store.layoutByWorkspace[sourceKey] : null;
    if (sourceKey && sourceLayout) {
      store.unpinAgent(sourceKey, input.agentId);
      store.hideAgent(sourceKey, input.agentId);
      for (const tab of collectAllTabs(sourceLayout.root)) {
        if (tab.target.kind === "agent" && tab.target.agentId === input.agentId)
          store.closeTab(sourceKey, tab.tabId);
      }
    }
  }
  const workspaceKey = buildWorkspaceTabPersistenceKey({
    serverId: input.serverId,
    workspaceId: input.targetWorkspaceId,
  });
  if (workspaceKey) {
    const tabId = store.openTab({
      workspaceKey,
      target: { kind: "agent", agentId: input.agentId },
      intent: "reveal",
      pin: true,
    });
    const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    const pane = tabId && layout ? findPaneContainingTab(layout.root, tabId) : null;
    if (pane && tabId)
      store.reorderTabsInPane(workspaceKey, pane.id, [
        tabId,
        ...pane.tabIds.filter((id) => id !== tabId),
      ]);
    useSidebarOrderStore.getState().promoteWorkspace(workspaceKey);
  }
  if (input.navigate === false) return;
  navigateToWorkspace({
    serverId: input.serverId,
    workspaceId: input.targetWorkspaceId,
    target: { kind: "agent", agentId: input.agentId },
  });
}

export function describeMove(input: {
  serverId: string;
  agentId: string | null;
  target: SidebarDropTarget;
}): { session: string; workspace: string } {
  const session = useSessionStore.getState().sessions[input.serverId];
  const agent = input.agentId ? session?.agents.get(input.agentId) : undefined;
  return {
    session: agent?.title ?? input.agentId?.slice(0, 8) ?? "",
    workspace: targetTitle(input.serverId, input.target),
  };
}

export function describeWorkspaceMove(input: {
  serverId: string;
  sourceWorkspaceId: string;
  target: SidebarDropTarget;
}): WorkspaceMovePlan {
  return {
    sessions: openAgentIds(input.serverId, input.sourceWorkspaceId).length,
    source: workspaceTitle(input.serverId, input.sourceWorkspaceId),
    target: targetTitle(input.serverId, input.target),
  };
}

export function sessionTitle(serverId: string, agentId: string): string | null {
  return useSessionStore.getState().sessions[serverId]?.agents.get(agentId)?.title ?? null;
}

export function workspaceOwnTitle(serverId: string, workspaceId: string): string | null {
  const workspace = findWorkspace(serverId, workspaceId);
  return workspace?.title ?? workspace?.name ?? null;
}

export function workspaceProjectId(serverId: string, workspaceId: string): string | null {
  return findWorkspace(serverId, workspaceId)?.projectId ?? null;
}

function openAgentIds(serverId: string, workspaceId: string): string[] {
  const session = useSessionStore.getState().sessions[serverId];
  return [...(session?.agents.values() ?? [])]
    .filter((agent) => agent.workspaceId === workspaceId && !agent.archivedAt)
    .map((agent) => agent.id);
}

function findWorkspace(serverId: string, workspaceId: string) {
  const session = useSessionStore.getState().sessions[serverId];
  return [...(session?.workspaces.values() ?? [])].find(
    (candidate) => candidate.id === workspaceId,
  );
}

function workspaceTitle(serverId: string, workspaceId: string): string {
  return workspaceOwnTitle(serverId, workspaceId) ?? workspaceId;
}

function targetTitle(serverId: string, target: SidebarDropTarget): string {
  return isWorkspaceDropTarget(target) ? workspaceTitle(serverId, target.workspaceId) : target.name;
}
