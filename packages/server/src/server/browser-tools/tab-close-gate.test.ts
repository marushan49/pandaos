import { describe, expect, it } from "vitest";
import type { BrowserTabClose } from "@getpaseo/protocol/browser-activity/rpc-schemas";
import { TAB_CLOSE_GRACE_MS, TabCloseGate } from "./tab-close-gate.js";

function createGate(viewed: string[]) {
  const events: BrowserTabClose[] = [];
  const timers: { run: () => void; delayMs: number; cancelled: boolean }[] = [];
  const closes: string[] = [];
  const gate = new TabCloseGate({
    isViewed: (browserId) => viewed.includes(browserId),
    publish: (event) => events.push(event),
    now: () => 1_000,
    schedule: (run, delayMs) => {
      const timer = { run, delayMs, cancelled: false };
      timers.push(timer);
      return {
        cancel: () => {
          timer.cancelled = true;
        },
      };
    },
  });
  const close = (browserId: string) => async () => {
    closes.push(browserId);
  };
  return { gate, events, timers, closes, close };
}

describe("TabCloseGate", () => {
  it("lets the caller close a tab nobody is viewing", () => {
    const { gate, events, timers, close } = createGate([]);
    expect(gate.defer({ workspaceId: "w", browserId: "b", close: close("b") })).toBeNull();
    expect(events).toEqual([]);
    expect(timers).toEqual([]);
  });

  it("holds a viewed tab open for the grace period and announces it", () => {
    const { gate, events, timers, closes, close } = createGate(["b"]);
    expect(gate.defer({ workspaceId: "w", browserId: "b", close: close("b") })).toEqual({
      status: "pending",
      closesAt: 1_000 + TAB_CLOSE_GRACE_MS,
    });
    expect(events).toEqual([
      {
        workspaceId: "w",
        browserId: "b",
        status: "pending",
        closesAt: 1_000 + TAB_CLOSE_GRACE_MS,
        updatedAt: 1_000,
      },
    ]);
    expect(timers.map((timer) => timer.delayMs)).toEqual([TAB_CLOSE_GRACE_MS]);
    expect(closes).toEqual([]);
    expect(gate.current()).toEqual(events);
  });

  it("closes the tab when the grace period ends", () => {
    const { gate, events, timers, closes, close } = createGate(["b"]);
    gate.defer({ workspaceId: "w", browserId: "b", close: close("b") });
    timers[0]?.run();
    expect(closes).toEqual(["b"]);
    expect(events.at(-1)).toEqual({
      workspaceId: "w",
      browserId: "b",
      status: "closed",
      updatedAt: 1_000,
    });
    expect(gate.current()).toEqual([]);
  });

  it("keeps the tab open when the user says so and refuses later closes", () => {
    const { gate, events, timers, closes, close } = createGate(["b"]);
    gate.defer({ workspaceId: "w", browserId: "b", close: close("b") });
    expect(gate.keepOpen("b")).toBe(true);
    expect(timers[0]?.cancelled).toBe(true);
    expect(events.at(-1)?.status).toBe("kept_open");
    expect(gate.defer({ workspaceId: "w", browserId: "b", close: close("b") })).toEqual({
      status: "kept_open",
    });
    expect(closes).toEqual([]);
    expect(gate.keepOpen("b")).toBe(false);
  });

  it("closes at once on close now", () => {
    const { gate, events, timers, closes, close } = createGate(["b"]);
    gate.defer({ workspaceId: "w", browserId: "b", close: close("b") });
    expect(gate.closeNow("b")).toBe(true);
    expect(timers[0]?.cancelled).toBe(true);
    expect(closes).toEqual(["b"]);
    expect(events.at(-1)?.status).toBe("closed");
    expect(gate.closeNow("b")).toBe(false);
  });

  it("reuses a pending close instead of scheduling a second one", () => {
    const { gate, timers, close } = createGate(["b"]);
    gate.defer({ workspaceId: "w", browserId: "b", close: close("b") });
    expect(gate.defer({ workspaceId: "w", browserId: "b", close: close("b") })).toEqual({
      status: "pending",
      closesAt: 1_000 + TAB_CLOSE_GRACE_MS,
    });
    expect(timers).toHaveLength(1);
  });

  it("forgets a pending close when the tab closes another way", () => {
    const { gate, events, timers, close } = createGate(["b"]);
    gate.defer({ workspaceId: "w", browserId: "b", close: close("b") });
    gate.closed({ workspaceId: "w", browserId: "b" });
    expect(timers[0]?.cancelled).toBe(true);
    expect(events.at(-1)?.status).toBe("closed");
    expect(gate.current()).toEqual([]);
  });
});
