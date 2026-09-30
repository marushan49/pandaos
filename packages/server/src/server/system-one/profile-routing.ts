import type { AgentProfile } from "@getpaseo/protocol/agent-profile";
import type { AgentModelDefinition, AgentPromptInput } from "../agent/agent-sdk-types.js";
import type { ProviderUsageListResult } from "../../services/quota-fetcher/service.js";
import type { ProviderUsage } from "../messages.js";
import { parseChoiceAnswer, type TypeSafeDecisionSource } from "../browser-tools/jev-client.js";

export interface RoutingProfile {
  id: string;
  label: string;
  harness: string;
  enabled: boolean;
  models: readonly AgentModelDefinition[];
}
export interface ProfileRouteInput {
  provider: string;
  model?: string;
  thinkingOptionId?: string;
  cwd: string;
  prompt: AgentPromptInput;
  fallback?: "quota" | "capacity";
  attemptedProfileIds?: readonly string[];
  attemptedRoutes?: readonly string[];
  explicitEffort?: boolean;
  recordFailure?: boolean;
  currentRetry?: boolean;
}
export interface ProfileRoute {
  profile: AgentProfile;
  model: string;
  reason: string;
  resetsAt: string | null;
}
export type ProfileRouter = (input: ProfileRouteInput) => Promise<ProfileRoute | null>;

export class ProfileRoutingUnavailableError extends Error {
  constructor(
    message: string,
    readonly resetsAt: string | null,
  ) {
    super(message);
  }
}

export function limitedReset(usage: ProviderUsage | undefined, now: number): string | null {
  const resets = (usage?.windows ?? [])
    .filter((window) => (window.usedPct ?? 0) >= 95)
    .map((window) => Date.parse(window.resetsAt ?? ""))
    .filter((reset) => Number.isFinite(reset) && reset > now);
  return resets.length ? new Date(Math.max(...resets)).toISOString() : null;
}

export function profileAvailability(
  usage: ProviderUsage | undefined,
  now: number,
): "available" | "limited" | "unknown" {
  if (usage?.status !== "available") return "unknown";
  let observed = false;
  for (const window of usage.windows) {
    if (typeof window.usedPct !== "number" || !Number.isFinite(window.usedPct)) continue;
    const reset = Date.parse(window.resetsAt ?? "");
    if (Number.isFinite(reset) && reset <= now) {
      observed = true;
      continue;
    }
    observed = true;
    if (window.usedPct >= 95) return "limited";
  }
  return observed ? "available" : "unknown";
}

interface ProfileRouterOptions {
  getProfiles: (cwd: string) => readonly RoutingProfile[];
  getUsage: (profileIds: readonly string[]) => Promise<ProviderUsageListResult | null>;
  decisionSource: (cwd: string) => TypeSafeDecisionSource;
  enabled: (cwd: string) => boolean;
  minimumConfidence: () => number;
  now?: () => number;
}

export function createProfileRouter(options: ProfileRouterOptions): ProfileRouter {
  const limits = new Map<string, { resetsAt: string | null; observedAt: number }>();
  return async (input) => {
    const now = (options.now ?? Date.now)();
    const profiles = options.getProfiles(input.cwd).filter((profile) => profile.enabled);
    const evidence = await options
      .getUsage(profiles.map((profile) => profile.id))
      .catch(() => null);
    const usage = new Map((evidence?.providers ?? []).map((entry) => [entry.providerId, entry]));
    const reset = limitedReset(usage.get(input.provider), now);
    const attempted = new Set(input.attemptedProfileIds ?? []);
    if (input.fallback === "quota" && input.recordFailure !== false) {
      limits.set(input.provider, { resetsAt: reset, observedAt: now });
      attempted.add(input.provider);
    }
    const eligible = profiles.filter((profile) => {
      const cooldown = limits.get(profile.id);
      if (cooldown) {
        const expired = cooldown.resetsAt !== null && Date.parse(cooldown.resetsAt) <= now;
        const refreshed =
          Date.parse(evidence?.fetchedAt ?? "") > cooldown.observedAt &&
          profileAvailability(usage.get(profile.id), now) === "available";
        if (!expired && !refreshed) return false;
        limits.delete(profile.id);
      }
      if (attempted.has(profile.id)) return false;
      return profileAvailability(usage.get(profile.id), now) === "available";
    });
    const futureResets = profiles
      .flatMap((profile) => {
        const value = limits.get(profile.id)?.resetsAt ?? limitedReset(usage.get(profile.id), now);
        return value && Date.parse(value) > now ? [value] : [];
      })
      .sort();
    const unavailable = (message: string) => {
      throw new ProfileRoutingUnavailableError(message, futureResets[0] ?? null);
    };
    const currentLimited =
      limits.has(input.provider) ||
      profileAvailability(usage.get(input.provider), now) === "limited";
    if (input.currentRetry) {
      if (currentLimited)
        return unavailable(
          "The current profile is still quota-limited; skipping its capacity retry.",
        );
      return null;
    }
    if (!options.enabled(input.cwd)) {
      if (input.fallback || currentLimited)
        return unavailable("Jev routing is disabled; the limited profile will not be attempted.");
      return null;
    }
    const { candidates, preserving } = routingCandidates(eligible, input);
    if (!candidates.length) {
      if (input.fallback || currentLimited)
        return unavailable(
          "No eligible profile with verified usage and a supported model is available.",
        );
      return null;
    }
    try {
      return await decideRoute(options, input, candidates, preserving, usage, reset);
    } catch (error) {
      if (error instanceof ProfileRoutingUnavailableError) throw error;
      if (input.fallback || currentLimited)
        return unavailable("Jev reassessment is unavailable; retaining the pending task.");
      return null;
    }
  };
}

interface RoutingCandidate {
  profile: RoutingProfile;
  model: AgentModelDefinition;
  effort: string | undefined;
}

function routingCandidates(eligible: RoutingProfile[], input: ProfileRouteInput) {
  const routes = new Set(input.attemptedRoutes ?? []);
  const allowedModel = (id: string) => !/astra/i.test(id);
  const allowedEffort = (model: string, effort: string | undefined) =>
    (effort !== "max" || input.explicitEffort || /luna/i.test(model)) &&
    !(/opus/i.test(model) && (effort === "xhigh" || effort === "extra-high"));
  const preserving = input.fallback
    ? eligible.flatMap((profile) => {
        const model = profile.models.find(
          (entry) => entry.id === input.model && entry.isSelectable !== false,
        );
        if (
          !model ||
          !allowedModel(model.id) ||
          routes.has(JSON.stringify([profile.id, model.id])) ||
          !allowedEffort(model.id, input.thinkingOptionId) ||
          (input.thinkingOptionId &&
            !model.thinkingOptions?.some((option) => option.id === input.thinkingOptionId))
        )
          return [];
        return [{ profile, model, effort: input.thinkingOptionId }];
      })
    : [];
  const candidates = preserving.length
    ? preserving
    : eligible.flatMap((profile) =>
        profile.models
          .filter(
            (model) =>
              model.isSelectable !== false &&
              allowedModel(model.id) &&
              !routes.has(JSON.stringify([profile.id, model.id])),
          )
          .flatMap((model) =>
            (model.thinkingOptions?.map((option) => option.id) ?? [undefined])
              .filter((effort) => allowedEffort(model.id, effort))
              .map((effort) => ({ profile, model, effort })),
          ),
      );
  return { candidates, preserving: preserving.length > 0 };
}

async function decideRoute(
  options: ProfileRouterOptions,
  input: ProfileRouteInput,
  candidates: RoutingCandidate[],
  preserving: boolean,
  usage: Map<string, ProviderUsage>,
  reset: string | null,
): Promise<ProfileRoute | null> {
  const unavailable = (message: string): never => {
    throw new ProfileRoutingUnavailableError(message, null);
  };
  const task =
    typeof input.prompt === "string"
      ? input.prompt
      : input.prompt.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n");
  if (!task.trim()) return null;
  const criteria = Object.fromEntries(
    candidates.map((candidate, index) => [
      `route${index}`,
      {
        profile: candidate.profile.id,
        harness: candidate.profile.harness,
        model: candidate.model.id,
        effort: candidate.effort ?? null,
        usedPct: usage.get(candidate.profile.id)?.windows.map((window) => window.usedPct),
      },
    ]),
  );
  const decision = await options.decisionSource(input.cwd).decide({
    state: {
      task: task.slice(0, 6000),
      current: { profile: input.provider, model: input.model, effort: input.thinkingOptionId },
      reassessment: !!input.fallback && !preserving,
    },
    questions: {
      route: {
        type: "choice",
        instructions:
          "Choose the best sufficient existing route for the task. GPT-6.1 Sol is the default; Opus 5.5 for complex architecture/debugging; Sonnet 5.5 high for execution. Select sufficient supported effort, never maximum by default. Prefer lower account usage when routes are equally suitable. Preserve model and effort whenever the choices allow it.",
        criteria,
      },
      reason: {
        type: "choice",
        instructions: "Classify the task requirement that explains the selected model and effort.",
        criteria: {
          mechanical: "Lookup or mechanical change",
          implementation: "Routine implementation or execution",
          complex: "Architecture, hard debugging or subtle security work",
        },
      },
    },
  });
  const selected = parseChoiceAnswer(decision.answers.route, Object.keys(criteria));
  const rationale = parseChoiceAnswer(decision.answers.reason, [
    "mechanical",
    "implementation",
    "complex",
  ]);
  if (
    selected.confidence < options.minimumConfidence() ||
    rationale.confidence < options.minimumConfidence()
  )
    return unavailable("Jev did not produce a confident route and reassessment reason.");
  const candidate = candidates[Number(selected.choice.slice(5))];
  if (!candidate) return unavailable("Jev selected an unknown route.");
  return {
    profile: {
      id: candidate.profile.id,
      name: candidate.profile.label,
      provider: candidate.profile.id,
      model: candidate.model.id,
      thinkingOptionId: candidate.effort,
    },
    model: candidate.model.id,
    resetsAt: reset,
    reason: preserving
      ? `Jev preserved model and effort (${selected.confidence})`
      : `Jev reassessed: ${rationale.choice} (${selected.confidence})`,
  };
}
