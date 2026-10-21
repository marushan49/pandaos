import type { StreamItem } from "@/types/stream";
import { resolveToolActivity, type ToolActivity } from "@/tool-calls/activity";
import { describeToolCall } from "@/tool-calls/detail-level/grouping";
import type { TurnPresentation } from "@/timeline/turn-liveness";
import type { TFunction } from "i18next";

export function buildWorkingLabel(
  t: TFunction,
  turn: TurnPresentation,
  needsInput: boolean,
  activity: ToolActivity | null,
  subagentCount: number,
): string {
  const labels: string[] = [];
  if (needsInput) labels.push(t("sidebar.status.needsInput"));
  else if (turn.isCancelling) labels.push(t("composer.cancel.cancelingAgent"));
  else if (turn.isWaiting) labels.push(t("sidebar.status.done"));
  else if (turn.isActive) {
    labels.push(activity ? t(`toolCallGroup.activity.${activity}`) : t("sidebar.status.running"));
  }
  if (subagentCount > 0) {
    labels.push(
      `${t("subagents.title")}: ${t("subagents.pillLabelWorking", { count: subagentCount })}`,
    );
  }
  return labels.join(", ");
}

export function resolveWorkingTool(
  items: readonly StreamItem[],
  turn: TurnPresentation,
): ToolActivity | null {
  if (!turn.isActive || turn.isCancelling || turn.isWaiting) return null;
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]!;
    if (item.kind === "user_message" && !turn.turnId && !turn.startedAt) break;
    if (turn.turnId && item.turnId && item.turnId !== turn.turnId) continue;
    if (turn.startedAt && item.timestamp < turn.startedAt) continue;
    if (item.kind !== "tool_call") continue;
    const descriptor = describeToolCall(item);
    if (descriptor.status === "running" || descriptor.status === "executing") {
      return resolveToolActivity(descriptor);
    }
  }
  return null;
}
