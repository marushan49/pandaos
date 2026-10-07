import type { CreateWorkspaceRequestOptions } from "@getpaseo/client/internal/daemon-client";
import type { FanoutModelRef } from "@/provider-selection/model-fanout";

type InitialAgent = NonNullable<CreateWorkspaceRequestOptions["agent"]>;
export type ConfiguredAgent = InitialAgent & { config: NonNullable<InitialAgent["config"]> };

export interface FanoutVariant {
  idempotencyKey: string;
  worktreeSlug: string;
}

export interface FanoutExtraPlan {
  model: FanoutModelRef;
  variant: FanoutVariant;
  agent: ConfiguredAgent;
}

export function planFanoutExtras(input: {
  base: ConfiguredAgent;
  extras: readonly FanoutModelRef[];
  draftId: string;
  worktreeSlug: string;
}): FanoutExtraPlan[] {
  const { base, extras, draftId, worktreeSlug } = input;
  return extras.map((model, index) => {
    const sameProvider = model.provider === base.config.provider;
    return {
      model,
      variant: {
        idempotencyKey: `${draftId}:fanout:${model.provider}:${model.modelId}`,
        worktreeSlug: `${worktreeSlug}-${index + 2}`,
      },
      agent: {
        ...base,
        clientMessageId: `${draftId}:fanout:${index + 1}:initial-message`,
        config: {
          ...base.config,
          provider: model.provider,
          model: model.modelId,
          modeId: sameProvider ? base.config.modeId : undefined,
          thinkingOptionId: undefined,
          featureValues: sameProvider ? base.config.featureValues : undefined,
        },
      },
    };
  });
}

export async function createFanoutExtras(
  plans: readonly FanoutExtraPlan[],
  create: (plan: FanoutExtraPlan) => Promise<unknown>,
): Promise<{ failed: Array<{ model: FanoutModelRef; error: Error }> }> {
  const settled = await Promise.allSettled(plans.map((plan) => create(plan)));
  const failed: Array<{ model: FanoutModelRef; error: Error }> = [];
  settled.forEach((result, index) => {
    if (result.status === "rejected") {
      failed.push({
        model: plans[index].model,
        error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
      });
    }
  });
  return { failed };
}
