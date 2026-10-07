import { describe, expect, it } from "vitest";
import type { SidebarWorkspaceEntry } from "@/hooks/sidebar-workspaces-view-model";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";
import {
  nextSnoozeWake,
  partitionSetAsideWorkspaces,
  snoozeUntilTomorrowMorning,
} from "./sidebar-set-aside";

function entry(
  workspaceKey: string,
  statusBucket: SidebarStateBucket,
  doneAt: string | null = null,
  statusEnteredAt: Date | null = null,
): SidebarWorkspaceEntry {
  return { workspaceKey, statusBucket, doneAt, statusEnteredAt } as SidebarWorkspaceEntry;
}

const NOW = 1_000_000;

describe("partitionSetAsideWorkspaces", () => {
  const entries = [
    entry("srv:done", "done", "2026-10-08T09:00:00.000Z"),
    entry("srv:snoozed", "attention"),
    entry("srv:woke", "done"),
    entry(
      "srv:asking-again",
      "needs_input",
      "2026-10-08T09:00:00.000Z",
      new Date("2026-10-08T10:00:00.000Z"),
    ),
    entry(
      "srv:done-while-failing",
      "failed",
      "2026-10-08T09:00:00.000Z",
      new Date("2026-10-08T08:00:00.000Z"),
    ),
    entry("srv:failed", "failed"),
    entry("srv:running", "running"),
  ];
  const snoozedWorkspaceUntil = { "srv:snoozed": NOW + 1, "srv:woke": NOW };

  it("sets aside done and snoozed rows until something new needs you, and counts what needs you", () => {
    const result = partitionSetAsideWorkspaces({
      entries,
      snoozedWorkspaceUntil,
      now: NOW,
      needsYouOnly: false,
    });
    expect(result.setAside.map((workspace) => workspace.workspaceKey)).toEqual([
      "srv:done",
      "srv:snoozed",
      "srv:done-while-failing",
    ]);
    expect([...result.visible.keys()]).toEqual([
      "srv:woke",
      "srv:asking-again",
      "srv:failed",
      "srv:running",
    ]);
    expect(result.needsYouCount).toBe(2);
  });

  it("narrows the visible rows to the ones that need you", () => {
    const result = partitionSetAsideWorkspaces({
      entries,
      snoozedWorkspaceUntil,
      now: NOW,
      needsYouOnly: true,
    });
    expect([...result.visible.keys()]).toEqual(["srv:asking-again", "srv:failed"]);
    expect(result.setAside).toHaveLength(3);
  });
});

describe("snooze deadlines", () => {
  it("snoozes until 9:00 local time on the next day", () => {
    const deadline = new Date(snoozeUntilTomorrowMorning(new Date(2026, 9, 8, 23, 30)));
    expect([deadline.getFullYear(), deadline.getMonth(), deadline.getDate()]).toEqual([2026, 9, 9]);
    expect([deadline.getHours(), deadline.getMinutes()]).toEqual([9, 0]);
  });

  it("wakes at the nearest future deadline", () => {
    expect(nextSnoozeWake({ a: NOW - 5, b: NOW + 50, c: NOW + 10 }, NOW)).toBe(NOW + 10);
    expect(nextSnoozeWake({ a: NOW }, NOW)).toBeNull();
  });
});
