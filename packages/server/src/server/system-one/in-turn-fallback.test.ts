import type { AgentProfile } from "@getpaseo/protocol/agent-profile";
import { describe, expect, it } from "vitest";
import {
  createInTurnRetryPlan,
  inTurnFallbackExhaustedVisibility,
  inTurnFallbackVisibility,
  isQuotaOrRateLimitError,
  resolveFallbackModel,
  selectNextInTurnFallback,
} from "./in-turn-fallback.js";

const profile = (id: string, provider: string, model: string): AgentProfile => ({
  id,
  name: id,
  provider,
  model,
});

describe("in-turn quota fallback", () => {
  it("detects provider quota and rate-limit failures without matching ordinary errors", () => {
    expect(isQuotaOrRateLimitError({ code: "rate_limit_exceeded" })).toBe(true);
    expect(isQuotaOrRateLimitError({ status: 429, message: "Too many requests" })).toBe(true);
    expect(isQuotaOrRateLimitError({ code: "invalid_request", message: "bad prompt" })).toBe(false);
  });

  it("prioritizes Sol over a same-provider Sonnet profile", () => {
    const result = selectNextInTurnFallback({
      currentProfileId: "claude-work",
      currentProvider: "claude",
      profiles: [
        profile("claude-work", "claude", "claude-opus"),
        profile("claude-fast", "claude", "claude-sonnet"),
        profile("codex-work", "codex", "gpt-6-sol"),
      ],
    });
    expect(result?.profile.id).toBe("codex-work");
  });

  it("continues from Sol to Opus then Sonnet regardless of configuration order", () => {
    const profiles = [
      profile("sonnet-profile", "claude", "claude-sonnet-5-5"),
      profile("opus-profile", "claude", "claude-opus-5-5"),
      profile("sol-profile", "codex", "gpt-6.1-sol"),
      profile("codex-plus", "codex-plus", "provider-default"),
    ];
    const opus = selectNextInTurnFallback({
      currentProfileId: "sol-profile",
      currentProvider: "codex",
      currentModel: "gpt-6.1-sol",
      profiles,
    });
    expect(opus?.profile.id).toBe("opus-profile");
    expect(opus?.model).toBe("claude-opus-5-5");

    const sonnet = selectNextInTurnFallback({
      currentProfileId: "opus-profile",
      currentProvider: "claude",
      profiles,
      attemptedProfileIds: ["sol-profile"],
    });
    expect(sonnet?.profile.id).toBe("sonnet-profile");
    expect(sonnet?.model).toBe("claude-sonnet-5-5");
  });

  it("uses configuration order for equal ranks, with Luna ahead of unknown models", () => {
    const profiles = [
      profile("unknown", "codex", "provider-default"),
      profile("luna", "codex", "gpt-6-luna"),
      profile("opus-first", "claude", "claude-opus-5-5"),
      profile("opus-second", "claude", "claude-opus-5-5"),
    ];
    const input = { currentProvider: "codex", profiles };
    expect(selectNextInTurnFallback(input)?.profile.id).toBe("opus-first");
    expect(
      selectNextInTurnFallback({
        ...input,
        attemptedProfileIds: ["opus-first", "opus-second"],
      })?.profile.id,
    ).toBe("luna");
  });

  it("reports exhaustion when every profile was attempted or none are configured", () => {
    const profiles = [profile("sol", "codex", "gpt-6.1-sol")];
    expect(selectNextInTurnFallback({ currentProvider: "codex", profiles: [] })).toBeNull();
    expect(
      selectNextInTurnFallback({ currentProvider: "codex", currentProfileId: "sol", profiles }),
    ).toBeNull();
  });

  it.each([
    ["gpt-6.1-sol", "claude-opus-5-5", "claude-sonnet-5-5", "gpt-6-luna"],
    ["claude-opus-5-5", "claude-sonnet-5-5", "gpt-6-luna"],
    ["claude-sonnet-5-5", "gpt-6-luna"],
    ["gpt-6-luna"],
  ])("resolves an unavailable model by family rank: %s", (...models) => {
    expect(
      resolveFallbackModel({
        requestedModel: "missing-model",
        availableModels: models.toReversed().map((id) => ({ id })),
      }),
    ).toBe(models[0]);
  });

  it("honors a configured model when available or when no discovery catalog is supplied", () => {
    const requestedModel = "claude-sonnet-5-5";
    expect(resolveFallbackModel({ requestedModel })).toBe(requestedModel);
    expect(
      resolveFallbackModel({
        requestedModel,
        availableModels: [{ id: "gpt-6.1-sol" }, { id: requestedModel }],
      }),
    ).toBe(requestedModel);
  });

  it("falls back from Opus or Sonnet to an available Sol-class model", () => {
    expect(
      resolveFallbackModel({
        currentModel: "claude-opus-5-5",
        requestedModel: "claude-opus-5-5",
        availableModels: [{ id: "gpt-6-sol" }, { id: "gpt-6-luna-max" }],
      }),
    ).toBe("gpt-6-sol");
  });

  it("keeps the original prompt and canonical history in the retry plan", () => {
    const candidate = {
      profile: profile("codex-work", "codex", "gpt-6-sol"),
      model: "gpt-6-sol",
      reason: "next-profile" as const,
    };
    const history = [{ type: "user_message" as const, text: "Keep going" }];
    const plan = createInTurnRetryPlan({ prompt: "Fix the failing test", history, candidate });
    expect(plan.prompt).toBe("Fix the failing test");
    expect(plan.context.history).toBe(history);
  });

  it("reports exhaustion and every switch in visible timeline items", () => {
    const exhausted = inTurnFallbackExhaustedVisibility();
    expect(exhausted).toMatchObject({ type: "notification", level: "error" });

    const candidate = {
      profile: profile("codex-work", "codex", "gpt-6-sol"),
      model: "gpt-6-sol",
      reason: "next-profile" as const,
    };
    expect(
      inTurnFallbackVisibility({ provider: "claude", model: "claude-sonnet" }, candidate)[0],
    ).toMatchObject({
      type: "notification",
      level: "warning",
    });
  });
});
