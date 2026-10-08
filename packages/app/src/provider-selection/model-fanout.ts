export const MAX_FANOUT_MODELS = 4;
export const FANOUT_CONFIRM_ABOVE = 2;

export interface FanoutModelRef {
  provider: string;
  modelId: string;
}

export interface ModelFanoutControls {
  count: number;
  isChecked: (provider: string, modelId: string) => boolean;
  isDisabled: (provider: string, modelId: string, label?: string) => boolean;
  onToggle: (provider: string, modelId: string) => void;
}

interface FanoutSelection {
  primary: FanoutModelRef;
  extras: FanoutModelRef[];
}

function sameModel(a: FanoutModelRef, b: FanoutModelRef): boolean {
  return a.provider === b.provider && a.modelId === b.modelId;
}

export function isFanoutSelectable(model: FanoutModelRef, label = ""): boolean {
  return !/astra/i.test(`${model.provider} ${model.modelId} ${label}`);
}

export function resolveFanoutExtras(
  primary: FanoutModelRef | null,
  extras: readonly FanoutModelRef[],
): FanoutModelRef[] {
  if (!primary) return [];
  const unique: FanoutModelRef[] = [];
  for (const extra of extras) {
    if (sameModel(extra, primary) || unique.some((entry) => sameModel(entry, extra))) continue;
    if (!isFanoutSelectable(extra)) continue;
    unique.push(extra);
  }
  return unique.slice(0, MAX_FANOUT_MODELS - 1);
}

export function toggleFanoutModel(
  selection: FanoutSelection,
  target: FanoutModelRef,
  label?: string,
): FanoutSelection {
  const extras = resolveFanoutExtras(selection.primary, selection.extras);
  if (sameModel(target, selection.primary)) {
    const [promoted, ...rest] = extras;
    return promoted ? { primary: promoted, extras: rest } : { primary: selection.primary, extras };
  }
  if (extras.some((extra) => sameModel(extra, target))) {
    return {
      primary: selection.primary,
      extras: extras.filter((extra) => !sameModel(extra, target)),
    };
  }
  if (extras.length + 1 >= MAX_FANOUT_MODELS || !isFanoutSelectable(target, label)) {
    return { primary: selection.primary, extras };
  }
  return { primary: selection.primary, extras: [...extras, target] };
}

export function fanoutNeedsConfirmation(count: number): boolean {
  return count > FANOUT_CONFIRM_ABOVE;
}
