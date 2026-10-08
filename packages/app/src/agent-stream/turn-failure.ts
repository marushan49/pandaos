import type { ComposerAttachment } from "@/attachments/types";
import type { AgentAttachment } from "@getpaseo/protocol/messages";
import type {
  AssistantMessageItem,
  NotificationItem,
  StreamItem,
  UserMessageItem,
} from "@/types/stream";

export type TurnFailureKind = "auth" | "limit" | "network" | "other";

export interface TurnFailureClass {
  kind: TurnFailureKind;
  retryAfterSeconds?: number;
}

export interface TurnFailure extends TurnFailureClass {
  message: string;
  prompt: UserMessageItem | null;
  touchedWorkspace: boolean;
  errorRow: AssistantMessageItem | null;
}

export interface RetrySubmission {
  text: string;
  attachments: ComposerAttachment[];
  agentAttachments: AgentAttachment[];
}

const SYSTEM_ERROR_PREFIX = "[System Error]";

const AUTH_PATTERN =
  /authenticat|oauth|\b401\b|unauthori[sz]ed|expired|invalid api key|not logged in|\/login\b/i;
const LIMIT_PATTERN =
  /rate[\s_-]?limit|quota|usage limit|retry[\s_-]?after|\b429\b|too many requests/i;
const NETWORK_PATTERN =
  /econnreset|econnrefused|enotfound|etimedout|socket hang up|fetch failed|network|timed? ?out|connection (?:closed|reset|refused|lost)|unreachable/i;

const DURATION = String.raw`(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?)?(?![\w\-:/]|\.\d)`;
const RETRY_AFTER_PATTERNS = [
  new RegExp(String.raw`retry[\s_-]*after[\s:=]*${DURATION}`, "i"),
  new RegExp(String.raw`(?:try again|resets?|available again) in ${DURATION}`, "i"),
];

function unitSeconds(unit: string | undefined): number {
  const normalized = (unit ?? "s").toLowerCase();
  if (normalized.startsWith("ms") || normalized.startsWith("milli")) return 0.001;
  if (normalized.startsWith("h")) return 3600;
  if (normalized.startsWith("m")) return 60;
  return 1;
}

function readRetryAfterSeconds(raw: string): number | undefined {
  for (const pattern of RETRY_AFTER_PATTERNS) {
    const match = pattern.exec(raw);
    if (!match) continue;
    const seconds = Math.ceil(Number(match[1]) * unitSeconds(match[2]));
    return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
  }
  return undefined;
}

export function classifyTurnFailure(raw: string): TurnFailureClass {
  if (AUTH_PATTERN.test(raw)) return { kind: "auth" };
  if (LIMIT_PATTERN.test(raw)) {
    const retryAfterSeconds = readRetryAfterSeconds(raw);
    return retryAfterSeconds === undefined
      ? { kind: "limit" }
      : { kind: "limit", retryAfterSeconds };
  }
  if (NETWORK_PATTERN.test(raw)) return { kind: "network" };
  return { kind: "other" };
}

export function presentSystemErrorRow(item: AssistantMessageItem): NotificationItem | null {
  if (!item.text.startsWith(SYSTEM_ERROR_PREFIX)) return null;
  return {
    kind: "notification",
    sourceType: "error",
    id: item.id,
    timestamp: item.timestamp,
    level: "error",
    message: item.text.slice(SYSTEM_ERROR_PREFIX.length).trim(),
    ...(item.turnId ? { turnId: item.turnId } : {}),
    ...(item.timelineCursor ? { timelineCursor: item.timelineCursor } : {}),
  };
}

function trailingSystemError(items: StreamItem[]): AssistantMessageItem | null {
  const last = items[items.length - 1];
  return last?.kind === "assistant_message" && last.text.startsWith(SYSTEM_ERROR_PREFIX)
    ? last
    : null;
}

export function projectFailedTurn(input: {
  lastError: string | null | undefined;
  isTurnActive: boolean;
  tail: StreamItem[];
  head: StreamItem[];
}): { tail: StreamItem[]; head: StreamItem[]; failure: TurnFailure | null } {
  const message = input.lastError?.trim();
  if (input.isTurnActive || !message) {
    return { tail: input.tail, head: input.head, failure: null };
  }
  const errorRow = trailingSystemError(input.head.length > 0 ? input.head : input.tail);
  const tail = errorRow && input.head.length === 0 ? input.tail.slice(0, -1) : input.tail;
  const head = errorRow && input.head.length > 0 ? input.head.slice(0, -1) : input.head;
  const items = [...tail, ...head];
  let promptIndex = -1;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]!.kind === "user_message") {
      promptIndex = index;
      break;
    }
  }
  const prompt = promptIndex >= 0 ? (items[promptIndex] as UserMessageItem) : null;
  const touchedWorkspace = items.slice(promptIndex + 1).some((item) => item.kind === "tool_call");
  return {
    tail,
    head,
    failure: { ...classifyTurnFailure(message), message, prompt, touchedWorkspace, errorRow },
  };
}

export function buildRetrySubmission(prompt: UserMessageItem): RetrySubmission {
  return {
    text: prompt.text,
    attachments: (prompt.images ?? []).map((metadata) => ({ kind: "image", metadata })),
    agentAttachments: prompt.attachments ?? [],
  };
}
