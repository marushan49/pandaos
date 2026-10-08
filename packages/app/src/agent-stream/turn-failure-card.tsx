import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { AnimatedDisclosure } from "@/components/ui/animated-disclosure";
import { ChevronRight } from "@/components/icons/ui-icons";
import { PandaStatus } from "@/components/panda-status";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { webTransition } from "@/styles/theme";
import type { TurnFailure } from "./turn-failure";

export const TurnFailureCard = memo(function TurnFailureCard({
  failure,
  onRetry,
  onOpenProviders,
  forkControl,
}: {
  failure: TurnFailure;
  onRetry?: () => Promise<void>;
  onOpenProviders?: () => void;
  forkControl?: ReactNode;
}) {
  const { t } = useTranslation();
  const active = useRetainedPanelActive();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const toggleDetails = useCallback(() => setDetailsOpen((open) => !open), []);
  const detailsState = useMemo(() => ({ expanded: detailsOpen }), [detailsOpen]);
  const renderDetailsChevron = useCallback(
    (color: string) => (
      <View style={detailsOpen ? styles.chevronOpen : styles.chevron}>
        <ChevronRight size={12} color={color} />
      </View>
    ),
    [detailsOpen],
  );
  const handleRetry = useCallback(async () => {
    if (!onRetry) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }, [onRetry]);

  const retryButton =
    onRetry && failure.prompt ? (
      <Button key="retry" testID="turn-failure-retry" loading={retrying} onPress={handleRetry}>
        {t("common.actions.retry")}
      </Button>
    ) : null;
  const providersButton = onOpenProviders ? (
    <Button key="providers" testID="turn-failure-providers" onPress={onOpenProviders}>
      {t("agentStream.turnFailure.providerSettings")}
    </Button>
  ) : null;
  const [primary, secondary] =
    failure.kind === "auth" ? [providersButton, retryButton] : [retryButton, providersButton];
  const showSecondary = failure.kind === "auth" || failure.kind === "limit";

  const body = [
    t(`agentStream.turnFailure.${failure.kind}.body`),
    failure.retryAfterSeconds
      ? t("agentStream.turnFailure.availableIn", {
          minutes: Math.max(1, Math.ceil(failure.retryAfterSeconds / 60)),
        })
      : null,
    failure.prompt ? t("agentStream.turnFailure.promptSaved") : null,
    failure.touchedWorkspace ? null : t("agentStream.turnFailure.nothingChanged"),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <View style={styles.shell} testID="turn-failure-card" accessibilityRole="alert">
      <View style={styles.surface}>
        <View style={styles.header}>
          <PandaStatus
            mood="err"
            size="large"
            pixelScale={1.5}
            animate={active}
            testID="turn-failure-panda"
          />
          <Text style={styles.title} testID="turn-failure-title">
            {t(`agentStream.turnFailure.${failure.kind}.title`)}
          </Text>
        </View>
        <Text style={styles.body}>{body}</Text>
        <View style={styles.actions}>
          {primary ? <View style={styles.primarySlot}>{primary}</View> : null}
          {showSecondary ? secondary : null}
          {forkControl}
        </View>
        <Button
          variant="ghost"
          size="xs"
          style={styles.detailsToggle}
          onPress={toggleDetails}
          accessibilityState={detailsState}
          testID="turn-failure-details-toggle"
          leftIcon={renderDetailsChevron}
        >
          {t("agentStream.turnFailure.technicalDetails")}
        </Button>
        <AnimatedDisclosure open={detailsOpen}>
          <Text selectable style={styles.details} testID="turn-failure-details">
            {failure.message}
          </Text>
        </AnimatedDisclosure>
      </View>
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  shell: {
    width: "100%",
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius["2xl"],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.hairline,
    backgroundColor: theme.colors.statusDangerTint,
  },
  surface: {
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface0,
    boxShadow: `inset 0 1px 0 ${theme.colors.surfaceHighlightTop}`,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  title: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.normal,
  },
  body: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    lineHeight: Math.round(theme.fontSize.base * 1.5),
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  primarySlot: {
    flexGrow: 1,
  },
  detailsToggle: {
    alignSelf: "flex-start",
    marginLeft: -theme.spacing[2],
  },
  chevron: {
    ...webTransition(["transform"]),
  },
  chevronOpen: {
    ...webTransition(["transform"]),
    transform: [{ rotate: "90deg" }],
  },
  details: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
}));
