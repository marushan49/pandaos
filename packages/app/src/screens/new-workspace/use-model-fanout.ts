import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { useAgentInputDraft } from "@/composer/draft/input-draft";
import {
  MAX_FANOUT_MODELS,
  isFanoutSelectable,
  resolveFanoutExtras,
  toggleFanoutModel,
  type FanoutModelRef,
  type ModelFanoutControls,
} from "@/provider-selection/model-fanout";

interface UseModelFanoutInput {
  serverId: string;
  canCreateWorktree: boolean;
  blockedBy: readonly unknown[];
  composerState: ReturnType<typeof useAgentInputDraft>["composerState"];
}

export function useModelFanout({
  serverId,
  canCreateWorktree,
  blockedBy,
  composerState,
}: UseModelFanoutInput) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<FanoutModelRef[]>([]);
  useEffect(() => {
    setSelection([]);
  }, [serverId]);
  const provider = composerState?.selectedProvider;
  const modelId = composerState?.effectiveModelId;
  const available = canCreateWorktree && !blockedBy.some(Boolean) && !composerState?.isAuto;
  const primary = useMemo<FanoutModelRef | null>(
    () => (provider && modelId ? { provider, modelId } : null),
    [modelId, provider],
  );
  const selectPrimary = composerState?.agentControls.onSelectProviderAndModel;
  const extras = useMemo(
    () => (available ? resolveFanoutExtras(primary, selection) : []),
    [available, primary, selection],
  );
  const count = extras.length + 1;
  const controls = useMemo<ModelFanoutControls | undefined>(() => {
    if (!available || !primary) return undefined;
    const isPrimary = (candidate: string, candidateModel: string) =>
      candidate === primary.provider && candidateModel === primary.modelId;
    const isChecked = (candidate: string, candidateModel: string) =>
      isPrimary(candidate, candidateModel) ||
      extras.some((extra) => extra.provider === candidate && extra.modelId === candidateModel);
    return {
      count,
      isChecked,
      isDisabled: (candidate, candidateModel, label) => {
        if (isPrimary(candidate, candidateModel)) return extras.length === 0;
        if (isChecked(candidate, candidateModel)) return false;
        return (
          count >= MAX_FANOUT_MODELS ||
          !isFanoutSelectable({ provider: candidate, modelId: candidateModel }, label)
        );
      },
      onToggle: (candidate, candidateModel) => {
        const next = toggleFanoutModel(
          { primary, extras },
          { provider: candidate, modelId: candidateModel },
        );
        setSelection(next.extras);
        if (next.primary !== primary) {
          selectPrimary?.(next.primary.provider, next.primary.modelId);
        }
      },
    };
  }, [available, count, extras, primary, selectPrimary]);
  const submitLabel = extras.length > 0 ? t("newWorkspace.fanout.start", { count }) : undefined;
  return { controls, extras, count, submitLabel };
}
