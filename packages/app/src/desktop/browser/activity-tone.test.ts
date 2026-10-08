import { describe, expect, it } from "vitest";
import type { BrowserActivityEvent } from "@getpaseo/protocol/browser-activity/rpc-schemas";
import { browserActivityTone } from "./activity-tone";

function event(patch: Partial<BrowserActivityEvent> = {}): BrowserActivityEvent {
  return {
    runId: "run-1",
    workspaceId: "ws-1",
    browserId: "tab-a",
    kind: "goal",
    label: "Sign in",
    phase: "deciding",
    step: 2,
    steps: [],
    pauseRequested: false,
    updatedAt: 1,
    ...patch,
  };
}

const failed = (uncertain?: boolean) =>
  event({
    phase: "finished",
    result: { status: "failed", message: "x", ...(uncertain ? { uncertain } : {}) },
  });

describe("browserActivityTone", () => {
  it("is red only for a definitive failure that no new run replaced", () => {
    expect(browserActivityTone(failed(), false)).toBe("neutral");
    expect(browserActivityTone(failed(), true)).toBe("failed");
    expect(browserActivityTone(failed(true), true)).toBe("neutral");
  });

  it("keeps running, paused, and passed runs out of the failure path", () => {
    expect(browserActivityTone(event(), true)).toBe("running");
    expect(browserActivityTone(event({ phase: "paused" }), true)).toBe("paused");
    expect(
      browserActivityTone(
        event({ phase: "finished", result: { status: "passed", message: "ok" } }),
        false,
      ),
    ).toBe("passed");
  });
});
