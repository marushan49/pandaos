import { describe, expect, test } from "vitest";
import { WSOutboundMessageSchema as GeneratedWSOutboundMessageSchema } from "./generated/validation/ws-outbound.aot.js";
import {
  SessionEventSubscriptionSchema,
  SessionInboundMessageSchema,
  SessionOutboundMessageSchema,
} from "./messages.js";

const order = {
  projectOrder: ["github.com/acme/repo", '["srv_a","prj_1"]'],
  pinnedWorkspaceOrder: ["srv_a:wks_1"],
  workspaceOrderByProject: { "github.com/acme/repo": ["srv_a:wks_1", "srv_b:wks_9"] },
};

describe("sidebar order message schemas", () => {
  test("parses the get and set requests", () => {
    expect(
      SessionInboundMessageSchema.parse({ type: "sidebar.order.get.request", requestId: "r1" }),
    ).toEqual({ type: "sidebar.order.get.request", requestId: "r1" });
    expect(
      SessionInboundMessageSchema.parse({
        type: "sidebar.order.set.request",
        requestId: "r2",
        baseRevision: 3,
        ...order,
      }),
    ).toEqual({ type: "sidebar.order.set.request", requestId: "r2", baseRevision: 3, ...order });
  });

  test("responses and the push parse through the generated outbound validator", () => {
    const messages = [
      { type: "sidebar.order.get.response", payload: { requestId: "r1", revision: 0, ...order } },
      { type: "sidebar.order.set.response", payload: { requestId: "r2", revision: 4, ...order } },
      { type: "sidebar.order.changed", payload: { revision: 4, ...order } },
    ];
    for (const message of messages) {
      expect(SessionOutboundMessageSchema.parse(message)).toEqual(message);
      const generated = GeneratedWSOutboundMessageSchema.safeParse({ type: "session", message });
      expect(generated.success).toBe(true);
    }
  });

  test("rejects a negative revision and a non-array workspace order", () => {
    expect(
      SessionOutboundMessageSchema.safeParse({
        type: "sidebar.order.changed",
        payload: { revision: -1, ...order },
      }).success,
    ).toBe(false);
    const generated = GeneratedWSOutboundMessageSchema.safeParse({
      type: "session",
      message: {
        type: "sidebar.order.changed",
        payload: { revision: 1, ...order, workspaceOrderByProject: { project: "srv_a:wks_1" } },
      },
    });
    expect(generated.success).toBe(false);
  });

  test("the push is an explicit event subscription", () => {
    expect(SessionEventSubscriptionSchema.parse("sidebar.order.changed")).toBe(
      "sidebar.order.changed",
    );
  });
});
