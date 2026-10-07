import { describe, expect, it } from "vitest";

import { publishBrowserMirror, subscribeWorkspaceBrowserMirror } from "./mirror";

describe("workspace mirror subscription", () => {
  it("fires once per new event of the workspace and stops after unsubscribe", () => {
    const calls: string[] = [];
    const stop = subscribeWorkspaceBrowserMirror("srv-ws", "wks-1", () => calls.push("hit"));
    const event = (browserId: string, workspaceId: string, at: number) => ({
      workspaceId,
      browserId,
      action: { kind: "navigate" as const, url: "http://localhost:4040/" },
      at,
    });

    publishBrowserMirror("srv-ws", event("b1", "wks-1", 10));
    publishBrowserMirror("srv-ws", event("b1", "wks-1", 10));
    publishBrowserMirror("srv-ws", event("b2", "wks-2", 11));
    expect(calls).toEqual(["hit"]);

    stop();
    publishBrowserMirror("srv-ws", event("b1", "wks-1", 12));
    expect(calls).toEqual(["hit"]);
  });
});
