import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import { isWorkspaceRootAgent } from "@/subagents/policies";
import { deriveSidebarStateBucket } from "./sidebar-agent-state";

export interface WorkspaceSessionRow {
  agentId: string;
  title: string | null;
  status: WorkspaceDescriptor["status"];
}

export interface WorkspaceAgentActivity {
  agentId: string;
  status: WorkspaceDescriptor["status"];
  enteredAt: Date | null;
  sessions?: readonly WorkspaceSessionRow[];
}

const NO_SESSIONS: readonly WorkspaceSessionRow[] = [];
const MAX_SESSION_ROWS = 3;

function workspaceAgentStatus(agent: Agent): Agent["status"] {
  if (agent.turn.phase === "open") return "running";
  return agent.status === "running" ? "idle" : agent.status;
}

function agentStatusBucket(agent: Agent): WorkspaceDescriptor["status"] {
  return deriveSidebarStateBucket({
    status: workspaceAgentStatus(agent),
    routingNotice: agent.routingNotice,
    pendingPermissionCount: agent.pendingPermissions.length,
    requiresAttention: agent.requiresAttention,
    attentionReason: agent.attentionReason,
  });
}

function buildSessionRows(roots: readonly Agent[]): readonly WorkspaceSessionRow[] {
  if (roots.length < 2) return NO_SESSIONS;
  return [...roots]
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .slice(1)
    .slice(-MAX_SESSION_ROWS)
    .map((agent) => ({ agentId: agent.id, title: agent.title, status: agentStatusBucket(agent) }));
}

function areSessionRowsEqual(
  left: readonly WorkspaceSessionRow[],
  right: readonly WorkspaceSessionRow[],
): boolean {
  return (
    left.length === right.length &&
    left.every((row, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        row.agentId === other.agentId &&
        row.title === other.title &&
        row.status === other.status
      );
    })
  );
}

export function buildWorkspaceAgentActivityIndex(
  agents: ReadonlyMap<string, Agent>,
  previous?: ReadonlyMap<string, WorkspaceAgentActivity>,
): Map<string, WorkspaceAgentActivity> {
  const activityByWorkspaceId = new Map<string, WorkspaceAgentActivity>();
  const latestActivityAtByWorkspaceId = new Map<string, Date>();
  const rootsByWorkspaceId = new Map<string, Agent[]>();

  for (const agent of agents.values()) {
    const parentAgent = agent.parentAgentId ? agents.get(agent.parentAgentId) : undefined;
    if (agent.archivedAt || !agent.workspaceId || !isWorkspaceRootAgent(agent, parentAgent)) {
      continue;
    }
    const roots = rootsByWorkspaceId.get(agent.workspaceId);
    if (roots) roots.push(agent);
    else rootsByWorkspaceId.set(agent.workspaceId, [agent]);

    const enteredAt = agent.attentionTimestamp ?? agent.updatedAt;
    const latestActivityAt = latestActivityAtByWorkspaceId.get(agent.workspaceId);
    if (latestActivityAt && enteredAt <= latestActivityAt) {
      continue;
    }
    latestActivityAtByWorkspaceId.set(agent.workspaceId, enteredAt);

    activityByWorkspaceId.set(agent.workspaceId, {
      agentId: agent.id,
      status: agentStatusBucket(agent),
      enteredAt,
    });
  }

  attachSessionRows(activityByWorkspaceId, rootsByWorkspaceId, previous);

  if (previous && areWorkspaceAgentActivityIndexesIdentical(previous, activityByWorkspaceId)) {
    return previous instanceof Map ? previous : new Map(previous);
  }
  return activityByWorkspaceId;
}

function attachSessionRows(
  activityByWorkspaceId: Map<string, WorkspaceAgentActivity>,
  rootsByWorkspaceId: ReadonlyMap<string, Agent[]>,
  previous: ReadonlyMap<string, WorkspaceAgentActivity> | undefined,
): void {
  for (const [workspaceId, activity] of activityByWorkspaceId) {
    const previousActivity = previous?.get(workspaceId);
    const sessions = buildSessionRows(rootsByWorkspaceId.get(workspaceId) ?? []);
    if (
      previousActivity?.agentId === activity.agentId &&
      previousActivity.status === activity.status &&
      areSessionRowsEqual(previousActivity.sessions ?? NO_SESSIONS, sessions)
    ) {
      activityByWorkspaceId.set(workspaceId, previousActivity);
    } else if (sessions.length > 0) {
      activityByWorkspaceId.set(workspaceId, { ...activity, sessions });
    }
  }
}

function areWorkspaceAgentActivityIndexesIdentical(
  previous: ReadonlyMap<string, WorkspaceAgentActivity>,
  next: ReadonlyMap<string, WorkspaceAgentActivity>,
): boolean {
  if (previous.size !== next.size) {
    return false;
  }
  for (const [workspaceId, activity] of next) {
    if (previous.get(workspaceId) !== activity) {
      return false;
    }
  }
  return true;
}
