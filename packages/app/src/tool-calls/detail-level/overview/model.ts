import { isPaseoToolName } from "@getpaseo/protocol/tool-name-normalization";
import { resolveToolCallOrigin, type ToolCallOrigin } from "../../origin";
import { describeToolCall, type ToolCallRun } from "../grouping";

const DIRECT_PASEO_TOOL_PREFIX = "paseo_";
const DIRECT_SEARCH_TOOL_SUFFIX_PATTERN = /(?:^|[_.:/])(?:web_search|llm_context)$/;

export interface OverviewSummary {
  editedFileCount: number;
  commandCount: number;
  readFileCount: number;
  searchCount: number;
  otherToolCount: number;
  paseoCallCount: number;
  failedCount: number;
  origins: Array<{ origin: ToolCallOrigin; count: number }>;
}

export interface OverviewToolCallGroup {
  mode: "overview";
  run: ToolCallRun;
  summary: OverviewSummary;
  isLoading: boolean;
  durationMs: number;
}

function isPaseoCall(name: string, normalizedName: string): boolean {
  return isPaseoToolName(name) || normalizedName.startsWith(DIRECT_PASEO_TOOL_PREFIX);
}

function isSearchCall(name: string): boolean {
  return DIRECT_SEARCH_TOOL_SUFFIX_PATTERN.test(name);
}

export function buildOverviewGroup(run: ToolCallRun): OverviewToolCallGroup {
  const editedFiles = new Set<string>();
  const readFiles = new Set<string>();
  let isLoading = false;
  let commandCount = 0;
  let searchCount = 0;
  let otherToolCount = 0;
  let paseoCallCount = 0;
  let failedCount = 0;
  const origins = new Map<string, { origin: ToolCallOrigin; count: number }>();

  for (const call of run.calls) {
    const descriptor = describeToolCall(call);
    const normalizedName = descriptor.name.trim().toLowerCase();
    isLoading ||= descriptor.status === "running" || descriptor.status === "executing";
    if (descriptor.status === "failed") {
      failedCount += 1;
    }
    const origin = resolveToolCallOrigin(descriptor.name, descriptor.metadata);
    if (origin) {
      const existing = origins.get(origin.id);
      origins.set(origin.id, { origin, count: (existing?.count ?? 0) + 1 });
    }
    if (isPaseoCall(descriptor.name, normalizedName)) {
      paseoCallCount += 1;
    } else if (descriptor.detail.type === "edit" || descriptor.detail.type === "write") {
      editedFiles.add(descriptor.detail.filePath);
    } else if (descriptor.detail.type === "shell") {
      commandCount += 1;
    } else if (descriptor.detail.type === "read") {
      readFiles.add(descriptor.detail.filePath);
    } else if (descriptor.detail.type === "search" || isSearchCall(normalizedName)) {
      searchCount += 1;
    } else {
      otherToolCount += 1;
    }
  }

  const summary = {
    editedFileCount: editedFiles.size,
    commandCount,
    readFileCount: readFiles.size,
    searchCount,
    otherToolCount,
    paseoCallCount,
    failedCount,
    origins: [...origins.values()],
  };
  const first = run.calls[0];
  const durationMs = first
    ? Math.max(0, run.latest.timestamp.getTime() - first.timestamp.getTime())
    : 0;
  return {
    mode: "overview",
    run,
    isLoading,
    summary,
    durationMs,
  };
}
