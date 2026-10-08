import { describe, expect, it } from "vitest";
import { createFanoutExtras, planFanoutExtras } from "./fanout";

const base = {
  config: {
    provider: "claude",
    cwd: "/repo",
    modeId: "bypassPermissions",
    model: "opus",
    thinkingOptionId: "high",
    featureValues: { fast: true },
  },
  initialPrompt: "fix the bug",
  clientMessageId: "draft-1:initial-message",
};

const extras = [
  { provider: "claude", modelId: "sonnet" },
  { provider: "codex", modelId: "gpt-6" },
];

describe("planFanoutExtras", () => {
  it("gives every extra its own key, slug and message id with the same prompt", () => {
    const plans = planFanoutExtras({
      base,
      extras,
      draftId: "draft-1",
      worktreeSlug: "smart-chipmunk",
    });
    expect(plans.map((plan) => plan.variant)).toEqual([
      { idempotencyKey: "draft-1:fanout:claude:sonnet", worktreeSlug: "smart-chipmunk-2" },
      { idempotencyKey: "draft-1:fanout:codex:gpt-6", worktreeSlug: "smart-chipmunk-3" },
    ]);
    expect(plans.map((plan) => plan.agent.clientMessageId)).toEqual([
      "draft-1:fanout:1:initial-message",
      "draft-1:fanout:2:initial-message",
    ]);
    expect(plans.every((plan) => plan.agent.initialPrompt === "fix the bug")).toBe(true);
  });

  it("keeps mode and features only within the same provider and resets thinking", () => {
    const [same, other] = planFanoutExtras({ base, extras, draftId: "d", worktreeSlug: "s" });
    expect(same.agent.config).toMatchObject({
      provider: "claude",
      model: "sonnet",
      modeId: "bypassPermissions",
      featureValues: { fast: true },
      thinkingOptionId: undefined,
    });
    expect(other.agent.config).toMatchObject({
      provider: "codex",
      model: "gpt-6",
      modeId: undefined,
      featureValues: undefined,
    });
  });
});

describe("createFanoutExtras", () => {
  it("reports failures without stopping the other extras", async () => {
    const plans = planFanoutExtras({ base, extras, draftId: "d", worktreeSlug: "s" });
    const started: string[] = [];
    const { failed } = await createFanoutExtras(plans, async (plan) => {
      started.push(plan.model.modelId);
      if (plan.model.modelId === "sonnet") throw new Error("boom");
    });
    expect(started).toEqual(["sonnet", "gpt-6"]);
    expect(failed).toHaveLength(1);
    expect(failed[0].model.modelId).toBe("sonnet");
    expect(failed[0].error.message).toBe("boom");
  });
});
