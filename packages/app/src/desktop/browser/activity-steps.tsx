import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type {
  BrowserActivityEvent,
  BrowserActivityStep,
} from "@getpaseo/protocol/browser-activity/rpc-schemas";
import { ArrowRightToLine } from "@/components/icons/ui-icons";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { mutedIconColorMapping } from "@/components/ui/icon-button-chrome";
import { describeBrowserActivityStep } from "@/desktop/browser/activity";

const ThemedSkip = withUnistyles(ArrowRightToLine);
const STEP_MARKERS: Record<BrowserActivityStep["status"], string> = {
  pending: "○",
  active: "●",
  done: "✓",
  failed: "✕",
};

export function BrowserActivitySteps({
  activity,
  onSkip,
  disabled = false,
  onActiveLayout,
}: {
  activity: BrowserActivityEvent;
  onSkip?: (step: number) => void;
  disabled?: boolean;
  onActiveLayout?: (y: number) => void;
}) {
  const { t } = useTranslation();
  const stepRows = useMemo(() => {
    const steps =
      activity.kind === "goal" && activity.action && activity.phase !== "verifying"
        ? [...activity.steps, activity.action]
        : activity.steps;
    return steps.map((step, position) => ({
      step,
      position,
      key: `${activity.runId}:${position}`,
    }));
  }, [activity]);
  return (
    <View accessibilityRole="list">
      {stepRows.length === 0 ? (
        <Text style={styles.pending}>{t("workspace.browser.activity.noSteps")}</Text>
      ) : null}
      {stepRows.map(({ step, position, key }) => (
        <ActivityStep
          key={key}
          step={step}
          position={position}
          onSkip={activity.kind === "recipe" ? onSkip : undefined}
          disabled={disabled}
          onActiveLayout={onActiveLayout}
        />
      ))}
    </View>
  );
}

function ActivityStep({
  step,
  position,
  onSkip,
  disabled,
  onActiveLayout,
}: {
  step: BrowserActivityStep;
  position: number;
  onSkip?: (step: number) => void;
  disabled: boolean;
  onActiveLayout?: (y: number) => void;
}) {
  const { t } = useTranslation();
  const [y, setY] = useState(0);
  const measure = useCallback((event: LayoutChangeEvent) => setY(event.nativeEvent.layout.y), []);
  useEffect(() => {
    if (step.status === "active") onActiveLayout?.(y);
  }, [onActiveLayout, step.status, y]);
  const skip = useCallback(() => onSkip?.(position + 1), [onSkip, position]);
  const description = describeBrowserActivityStep(step);
  let status = t(`workspace.browser.activity.stepStatus.${step.status}`);
  if (step.skipped) status = t("workspace.browser.activity.skipped");
  else if (step.skipRequested) status = t("workspace.browser.activity.skipRequested");
  const marker = step.skipped || step.skipRequested ? "↷" : STEP_MARKERS[step.status];
  return (
    <View onLayout={measure} style={[styles.row, step.status === "active" && styles.active]}>
      <View
        accessible
        accessibilityLabel={`${position + 1}. ${status}: ${description}`}
        style={styles.step}
      >
        <Text style={step.status === "failed" && !step.skipped ? styles.failed : styles.marker}>
          {marker}
        </Text>
        <Text style={step.status === "pending" || step.skipped ? styles.pending : styles.text}>
          {description}
          {step.skipped || step.skipRequested ? ` · ${status}` : ""}
        </Text>
      </View>
      {onSkip && step.status === "pending" && !step.skipRequested ? (
        <ToolbarButton
          label={t("workspace.browser.activity.skipStep", { step: position + 1 })}
          onPress={skip}
          disabled={disabled}
          testID={`browser-activity-skip-${position + 1}`}
        >
          <ThemedSkip size={14} uniProps={mutedIconColorMapping} />
        </ToolbarButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing[1],
    gap: theme.spacing[1],
  },
  active: { backgroundColor: theme.colors.surface2, borderRadius: theme.borderRadius.sm },
  step: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: theme.spacing[2] },
  marker: { width: 16, color: theme.colors.foregroundMuted, fontSize: theme.fontSize.base },
  failed: { width: 16, color: theme.colors.statusDanger, fontSize: theme.fontSize.base },
  text: { flex: 1, color: theme.colors.foreground, fontSize: theme.fontSize.base },
  pending: { flex: 1, color: theme.colors.foregroundMuted, fontSize: theme.fontSize.base },
}));
