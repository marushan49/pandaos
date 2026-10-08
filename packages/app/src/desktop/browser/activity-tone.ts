import type { BrowserActivityEvent } from "@getpaseo/protocol/browser-activity/rpc-schemas";

export type BrowserActivityTone = "running" | "paused" | "passed" | "failed" | "neutral";

export function isDefinitiveFailure(event: BrowserActivityEvent): boolean {
  return event.result?.status === "failed" && !event.result.uncertain;
}

export function browserActivityTone(
  event: BrowserActivityEvent,
  failureConfirmed: boolean,
): BrowserActivityTone {
  if (event.phase === "paused") return "paused";
  if (event.phase !== "finished") return "running";
  if (event.result?.status === "passed") return "passed";
  return isDefinitiveFailure(event) && failureConfirmed ? "failed" : "neutral";
}
