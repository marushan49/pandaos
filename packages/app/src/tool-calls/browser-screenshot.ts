import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";

export interface BrowserScreenshotTarget {
  workspaceId: string;
  runId: string;
  name: string;
}

const EVIDENCE_REF_PATTERN = /^evidence:\/\/([^/]+)\/([^/]+)\/([^/]+)$/;
const BROWSER_RUN_TOOL_PATTERN = /browser_(?:test|goal)$/i;

export function parseBrowserScreenshotRef(ref: unknown): BrowserScreenshotTarget | null {
  if (typeof ref !== "string") return null;
  const match = EVIDENCE_REF_PATTERN.exec(ref);
  if (!match) return null;
  const [, workspaceId, runId, name] = match;
  return workspaceId && runId && name ? { workspaceId, runId, name } : null;
}

function readScreenshotRef(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return readScreenshotRef(JSON.parse(value));
    } catch {
      return undefined;
    }
  }
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (record.screenshotRef !== undefined) return record.screenshotRef;
  const content = Array.isArray(record.content) ? record.content : [];
  const texts = content.map((item) => (item as { text?: unknown } | null)?.text);
  return [record.structuredContent, record.result, ...texts]
    .map(readScreenshotRef)
    .find((ref) => ref !== undefined);
}

export function findBrowserScreenshot(
  toolName: string,
  detail: ToolCallDetail | undefined,
): BrowserScreenshotTarget | null {
  if (!BROWSER_RUN_TOOL_PATTERN.test(toolName) || detail?.type !== "unknown") return null;
  return parseBrowserScreenshotRef(readScreenshotRef(detail.output));
}
