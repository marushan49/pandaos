import { isPaseoToolName } from "@getpaseo/protocol/tool-name-normalization";
import type { ToolCallDescriptor } from "./detail-level/grouping";

export type ToolActivity =
  | "runningCommand"
  | "readingFiles"
  | "editingFiles"
  | "searching"
  | "fetching"
  | "delegating"
  | "clicking"
  | "typing"
  | "waiting"
  | "capturingPage"
  | "readingPage"
  | "openingPage"
  | "scrolling"
  | "runningScript"
  | "drivingBrowser"
  | "usingBrowser"
  | "callingPandaos"
  | "usingTools";

const MAX_ACTIVITY_LABELS = 3;
const BROWSER_TOOL_PATTERN = /(?:^|[_.:/])browser_([a-z_]+)$/;

const BROWSER_ACTIVITIES: Record<string, ToolActivity> = {
  click: "clicking",
  hover: "clicking",
  drag: "clicking",
  type: "typing",
  fill: "typing",
  select: "typing",
  keypress: "typing",
  upload: "typing",
  wait: "waiting",
  screenshot: "capturingPage",
  snapshot: "readingPage",
  logs: "readingPage",
  list_tabs: "readingPage",
  new_tab: "openingPage",
  navigate: "openingPage",
  back: "openingPage",
  forward: "openingPage",
  reload: "openingPage",
  scroll: "scrolling",
  evaluate: "runningScript",
  goal: "drivingBrowser",
  test: "drivingBrowser",
};

export function resolveToolActivity(descriptor: ToolCallDescriptor): ToolActivity {
  switch (descriptor.detail.type) {
    case "shell":
      return "runningCommand";
    case "read":
      return "readingFiles";
    case "edit":
    case "write":
      return "editingFiles";
    case "search":
      return "searching";
    case "fetch":
      return "fetching";
    case "sub_agent":
      return "delegating";
  }
  const name = descriptor.name.trim().toLowerCase();
  const browserAction = BROWSER_TOOL_PATTERN.exec(name)?.[1];
  if (browserAction) {
    return BROWSER_ACTIVITIES[browserAction] ?? "usingBrowser";
  }
  if (isPaseoToolName(name) || name.startsWith("paseo_")) {
    return "callingPandaos";
  }
  return "usingTools";
}

export function joinActivityLabels(labels: readonly string[]): string {
  const distinct = [...new Set(labels)];
  const shown = distinct.slice(-MAX_ACTIVITY_LABELS);
  const hiddenCount = distinct.length - shown.length;
  const joined = shown
    .map((label, index) =>
      index === 0 ? label : `${label.charAt(0).toLocaleLowerCase()}${label.slice(1)}`,
    )
    .join(", ");
  return hiddenCount > 0 ? `${joined} +${hiddenCount}` : joined;
}
