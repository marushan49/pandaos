import { useToast } from "@getpaseo/plugin/client/react-native";
import { useEffect, useRef } from "react";
import type { BreezeState, Task } from "../shared/contracts";
import { snippet } from "./format";

interface Seen {
  hostId: string;
  tasks: Map<string, Task["status"]>;
  notices: Set<string>;
}

const OUTCOME_VARIANT: Partial<Record<Task["status"], "success" | "warning" | "error">> = {
  done: "success",
  failed: "error",
  needs_input: "warning",
};

function outcomeLine(task: Task): string | null {
  const title = snippet(task.title, 60);
  if (task.status === "done") return `Erledigt: ${title}`;
  if (task.status === "needs_input") return `Braucht dich: ${title}`;
  if (task.status === "failed") return `Fehlgeschlagen: ${title}`;
  return null;
}

export function useBreezeNotices(hostId: string, state: BreezeState | undefined) {
  const toast = useToast();
  const seen = useRef<Seen | null>(null);

  useEffect(() => {
    if (!state) return;
    const previous = seen.current;
    const next: Seen = {
      hostId,
      tasks: new Map(state.tasks.map((task) => [task.id, task.status])),
      notices: new Set(state.notices.map((notice) => notice.id)),
    };
    seen.current = next;
    if (!previous || previous.hostId !== hostId) return;

    const lines: { text: string; variant: "success" | "warning" | "error" | "info" }[] = [];

    const demoIds = new Set(state.tasks.filter((task) => task.demo).map((task) => task.id));
    const freshNotices = state.notices.filter(
      (notice) => !previous.notices.has(notice.id) && !demoIds.has(notice.taskId),
    );
    for (const notice of freshNotices) lines.push({ text: notice.text, variant: "info" });

    const noticeTaskIds = new Set(freshNotices.map((notice) => notice.taskId));
    for (const task of state.tasks) {
      const before = previous.tasks.get(task.id);
      if (before === task.status || noticeTaskIds.has(task.id)) continue;
      if (before === undefined) {
        if (!task.demo && task.status === "ready") {
          lines.push({ text: `Neue Aufgabe: ${snippet(task.title, 60)}`, variant: "info" });
        }
        continue;
      }
      const text = outcomeLine(task);
      if (!text) continue;
      lines.push({
        text,
        variant: OUTCOME_VARIANT[task.status] ?? "warning",
      });
    }

    if (lines.length === 0) return;
    const [first, ...rest] = lines;
    const suffix = rest.length > 0 ? ` (und ${rest.length} weitere)` : "";
    toast.show(`${first.text}${suffix}`, { variant: first.variant, durationMs: 4500 });
  }, [hostId, state, toast]);
}
