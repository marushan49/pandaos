import type { AgentSessionConfig } from "./agent-sdk-types.js";

export type CarriedSessionSettings = Pick<
  AgentSessionConfig,
  "modeId" | "thinkingOptionId" | "featureValues"
>;

export function carriedSessionSettings(
  current: CarriedSessionSettings,
  target: { sameFamily: boolean; thinkingOptionIds?: readonly string[] },
): CarriedSessionSettings {
  if (!target.sameFamily) return {};
  const thinkingOffered =
    !current.thinkingOptionId ||
    !target.thinkingOptionIds ||
    target.thinkingOptionIds.includes(current.thinkingOptionId);
  return {
    modeId: current.modeId,
    thinkingOptionId: thinkingOffered ? current.thinkingOptionId : undefined,
    featureValues: current.featureValues,
  };
}
