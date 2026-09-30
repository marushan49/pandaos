import { expect, it, vi } from "vitest";
import {
  createProfileRouter,
  ProfileRoutingUnavailableError,
  type RoutingProfile,
} from "./profile-routing.js";
import type { ProviderUsage } from "../messages.js";
import type { TypeSafeDecisionRequest } from "../browser-tools/jev-client.js";

function usage(providerId: string, usedPct = 10, resetsAt?: string): ProviderUsage {
  return {
    providerId,
    displayName: providerId,
    status: "available",
    planLabel: null,
    windows: [{ id: "session", label: "Session", usedPct, remainingPct: 100 - usedPct, resetsAt }],
    balances: [],
    details: [],
    error: null,
  };
}
const profiles: RoutingProfile[] = ["codex-plus", "codex-work", "codex-business"].map((id) => ({
  id,
  label: id,
  harness: "codex",
  enabled: true,
  models: [
    {
      provider: id,
      id: "gpt-6.1-sol",
      label: "Sol",
      thinkingOptions: [{ id: "medium", label: "Medium" }],
    },
  ],
}));
function fixture(entries = profiles.map((profile) => usage(profile.id)), catalog = profiles) {
  let now = Date.parse("2026-09-30T12:00:00Z");
  const decide = vi.fn(async (request: TypeSafeDecisionRequest) => {
    const route = request.questions.route;
    if (route.type !== "choice") throw new Error("expected route choice");
    const choice = Object.keys(route.criteria)[0];
    return {
      model: "jev",
      latencyMs: 1,
      answers: {
        route: {
          choice,
          confidence: 0.99,
          probabilities: Object.fromEntries(
            Object.keys(route.criteria).map((key) => [key, key === choice ? 1 : 0]),
          ),
        },
        reason: {
          choice: "implementation",
          confidence: 0.99,
          probabilities: { mechanical: 0, implementation: 1, complex: 0 },
        },
      },
    };
  });
  const getUsage = vi.fn(async () => ({
    fetchedAt: new Date(now).toISOString(),
    providers: entries,
  }));
  const router = createProfileRouter({
    getProfiles: () => catalog,
    getUsage,
    decisionSource: () => ({ decide }),
    enabled: () => true,
    minimumConfidence: () => 0.5,
    now: () => now,
  });
  const input = {
    provider: "codex-plus",
    model: "gpt-6.1-sol",
    thinkingOptionId: "medium",
    cwd: "/private-project",
    prompt: "Implement the task",
  };
  return {
    router,
    input,
    decide,
    getUsage,
    setNow: (value: string) => {
      now = Date.parse(value);
    },
  };
}

it("preserves model/effort on a distinct actual account with identical provider family and model", async () => {
  const f = fixture();
  const route = await f.router({
    ...f.input,
    fallback: "quota",
    attemptedProfileIds: ["codex-work"],
  });
  expect(route?.profile).toMatchObject({ provider: "codex-business", thinkingOptionId: "medium" });
  expect(route?.reason).toContain("preserved");
  expect(f.getUsage).toHaveBeenCalledWith(["codex-plus", "codex-work", "codex-business"]);
});
it("skips a future reset and makes the account eligible when a controlled clock expires it", async () => {
  const f = fixture([
    usage("codex-plus", 100, "2026-09-30T13:00:00Z"),
    usage("codex-work", 100, "2026-10-28T13:29:00Z"),
    usage("codex-business"),
  ]);
  expect((await f.router(f.input))?.profile.provider).toBe("codex-business");
  f.setNow("2026-09-30T13:00:00Z");
  expect((await f.router(f.input))?.profile.provider).toBe("codex-plus");
});
it("does not poison account quota cooldowns with capacity failures", async () => {
  const f = fixture();
  expect(
    (
      await f.router({
        ...f.input,
        fallback: "capacity",
        attemptedRoutes: [JSON.stringify(["codex-plus", "gpt-6.1-sol"])],
      })
    )?.profile.provider,
  ).toBe("codex-work");
  expect((await f.router(f.input))?.profile.provider).toBe("codex-plus");
});
it("retains observed quota origins through consecutive failures and exhaustion", async () => {
  const f = fixture();
  await f.router({ ...f.input, fallback: "quota" });
  await f.router({
    ...f.input,
    provider: "codex-work",
    fallback: "quota",
    attemptedProfileIds: ["codex-plus"],
  });
  await expect(
    f.router({
      ...f.input,
      provider: "codex-business",
      fallback: "quota",
      attemptedProfileIds: ["codex-plus", "codex-work"],
    }),
  ).rejects.toBeInstanceOf(ProfileRoutingUnavailableError);
  expect(f.decide).toHaveBeenCalledTimes(2);
  await expect(f.router(f.input)).rejects.toBeInstanceOf(ProfileRoutingUnavailableError);
});
it("requires actual usage and a supported catalog instead of guessing availability", async () => {
  const f = fixture([]);
  await expect(f.router({ ...f.input, fallback: "quota" })).rejects.toThrow("verified usage");
  expect(f.decide).not.toHaveBeenCalled();
});
it("reassesses only after preserving candidates are exhausted, with auditable policy bounds", async () => {
  const models = ["gpt-6-luna", "gpt-6-astra", "claude-opus-5-5"].map((id) => ({
    provider: "claude",
    id,
    label: id,
    thinkingOptions: ["medium", "xhigh", "max"].map((effort) => ({ id: effort, label: effort })),
  }));
  const f = fixture(
    [usage("codex-plus"), usage("claude")],
    [profiles[0], { id: "claude", label: "Claude", enabled: true, harness: "claude", models }],
  );
  const route = await f.router({ ...f.input, fallback: "quota" });
  expect(route?.reason).toContain("reassessed: implementation");
  const question = f.decide.mock.calls[0][0].questions.route;
  if (question.type !== "choice") throw new Error("expected choice");
  const candidates = Object.values(question.criteria) as Array<{ model: string; effort: string }>;
  expect(candidates.some((candidate) => /astra/.test(candidate.model))).toBe(false);
  expect(
    candidates.some(
      (candidate) => /opus/.test(candidate.model) && ["xhigh", "max"].includes(candidate.effort),
    ),
  ).toBe(false);
  expect(
    candidates.some((candidate) => /luna/.test(candidate.model) && candidate.effort === "max"),
  ).toBe(true);
});

it("does not attempt a capacity retry while a genuine quota reset is still in the future", async () => {
  const f = fixture([usage("codex-plus", 100, "2026-09-30T13:00:00Z"), usage("codex-business")]);
  await expect(f.router({ ...f.input, currentRetry: true })).rejects.toThrow("still quota-limited");
  expect(f.decide).not.toHaveBeenCalled();
  f.setNow("2026-09-30T13:00:00Z");
  await expect(f.router({ ...f.input, currentRetry: true })).resolves.toBeNull();
});
