import type { SidebarWorkspaceEntry } from "@/hooks/sidebar-workspaces-view-model";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";

export function workspaceNeedsYou(bucket: SidebarStateBucket): boolean {
  return bucket === "needs_input" || bucket === "failed";
}

export function isSnoozed(until: number | undefined, now: number): boolean {
  return until !== undefined && until > now;
}

export function snoozeUntilTomorrowMorning(now: Date): number {
  const deadline = new Date(now);
  deadline.setDate(deadline.getDate() + 1);
  deadline.setHours(9, 0, 0, 0);
  return deadline.getTime();
}

export function nextSnoozeWake(
  snoozedWorkspaceUntil: Readonly<Record<string, number>>,
  now: number,
): number | null {
  let next: number | null = null;
  for (const until of Object.values(snoozedWorkspaceUntil)) {
    if (until > now && (next === null || until < next)) next = until;
  }
  return next;
}

function happenedAfter(enteredAt: Date | null, doneAt: string | null | undefined): boolean {
  if (!enteredAt || !doneAt) return false;
  return enteredAt.getTime() > Date.parse(doneAt);
}

export interface SidebarSetAsidePartition {
  visible: Map<string, SidebarWorkspaceEntry>;
  setAside: SidebarWorkspaceEntry[];
  needsYouCount: number;
}

export function partitionSetAsideWorkspaces(input: {
  entries: Iterable<SidebarWorkspaceEntry>;
  snoozedWorkspaceUntil: Readonly<Record<string, number>>;
  now: number;
  needsYouOnly: boolean;
}): SidebarSetAsidePartition {
  const visible = new Map<string, SidebarWorkspaceEntry>();
  const setAside: SidebarWorkspaceEntry[] = [];
  let needsYouCount = 0;
  for (const entry of input.entries) {
    const needsYou = workspaceNeedsYou(entry.statusBucket);
    const isDone =
      Boolean(entry.doneAt) && !(needsYou && happenedAfter(entry.statusEnteredAt, entry.doneAt));
    const isSnoozedAway =
      !needsYou && isSnoozed(input.snoozedWorkspaceUntil[entry.workspaceKey], input.now);
    if (isDone || isSnoozedAway) {
      setAside.push(entry);
      continue;
    }
    if (needsYou) needsYouCount += 1;
    if (input.needsYouOnly && !needsYou) continue;
    visible.set(entry.workspaceKey, entry);
  }
  return { visible, setAside, needsYouCount };
}
