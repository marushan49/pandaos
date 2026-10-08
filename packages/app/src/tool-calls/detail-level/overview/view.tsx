import React, { memo, useCallback, useMemo, useRef, type ReactNode } from "react";
import { ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { Wrench } from "@/components/icons/ui-icons";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDuration } from "@/utils/time";
import { StyleSheet } from "react-native-unistyles";
import { ExpandableBadge } from "@/components/message";
import { useIsCompactFormFactor } from "@/constants/layout";
import { type OverviewSummary, type OverviewToolCallGroup } from "./model";
import { OverviewToolCallGroupSheet } from "./sheet";

interface OverviewGroupProps {
  group: OverviewToolCallGroup;
  expanded: boolean;
  isLastInSequence: boolean;
  onExpandedChange: (groupId: string, expanded: boolean) => void;
  children: ReactNode;
}

const TOOL_CALL_GROUP_MAX_HEIGHT = 400;

function joinSummaryParts(parts: string[], conjunction: string, capitalize: boolean): string {
  if (parts.length === 0) {
    return "";
  }
  let joined = parts[0] ?? "";
  if (parts.length === 2) {
    joined = `${parts[0]} ${conjunction} ${parts[1]}`;
  } else if (parts.length > 2) {
    joined = `${parts.slice(0, -1).join(", ")}, ${conjunction} ${parts.at(-1)}`;
  }
  const firstCharacter = joined[0];
  if (!firstCharacter) {
    return joined;
  }
  const first = capitalize
    ? firstCharacter.toLocaleUpperCase()
    : firstCharacter.toLocaleLowerCase();
  return `${first}${joined.slice(1)}`;
}

function useOverviewSummary(summary: OverviewSummary, capitalize: boolean): string {
  const { t } = useTranslation();
  return useMemo(() => {
    const parts: string[] = [];
    const entries = [
      [summary.editedFileCount, "toolCallGroup.editedFiles"],
      [summary.commandCount, "toolCallGroup.commands"],
      [summary.readFileCount, "toolCallGroup.readFiles"],
      [summary.searchCount, "toolCallGroup.searches"],
      [summary.otherToolCount, "toolCallGroup.otherTools"],
      [summary.paseoCallCount, "toolCallGroup.paseoCalls"],
    ] as const;
    for (const [count, key] of entries) {
      if (count > 0) {
        parts.push(t(`${key}.${count === 1 ? "one" : "other"}`, { count }));
      }
    }
    return joinSummaryParts(parts, t("toolCallGroup.and"), capitalize);
  }, [capitalize, summary, t]);
}

const MIN_REPORTED_DURATION_MS = 1000;

function useOverviewLabel(group: OverviewToolCallGroup): string {
  const { t } = useTranslation();
  const showsDuration = !group.isLoading && group.durationMs >= MIN_REPORTED_DURATION_MS;
  const summary = useOverviewSummary(group.summary, !showsDuration);
  if (!showsDuration) {
    return summary;
  }
  const workedFor = t("toolCallGroup.workedFor", { duration: formatDuration(group.durationMs) });
  return `${workedFor}, ${summary}`;
}

export const OverviewToolCallGroupView = memo(function OverviewToolCallGroupView({
  group,
  expanded,
  isLastInSequence,
  onExpandedChange,
  children,
}: OverviewGroupProps) {
  const scrollRef = useRef<ScrollView>(null);
  const isCompact = useIsCompactFormFactor();
  const { t } = useTranslation();
  const aggregateSummary = useOverviewLabel(group);
  const failedCount = group.summary.failedCount;
  const failedBadge = useMemo(
    () =>
      failedCount > 0 ? (
        <StatusBadge
          variant="error"
          size="xs"
          label={t("toolCallGroup.failed", { count: failedCount })}
        />
      ) : null,
    [failedCount, t],
  );
  const originTags = useMemo(
    () =>
      group.summary.origins.map(({ origin, count }) => ({
        ...origin,
        label: count > 1 ? `${origin.label} ×${count}` : origin.label,
      })),
    [group.summary.origins],
  );
  const scrollToLatest = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, []);
  const toggle = useCallback(() => {
    onExpandedChange(group.run.id, !expanded);
  }, [expanded, group.run.id, onExpandedChange]);
  const close = useCallback(() => {
    onExpandedChange(group.run.id, false);
  }, [group.run.id, onExpandedChange]);
  const renderDetails = useCallback(
    () => (
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        nestedScrollEnabled
        showsVerticalScrollIndicator
        onContentSizeChange={scrollToLatest}
      >
        {children}
      </ScrollView>
    ),
    [children, scrollToLatest],
  );

  if (isCompact) {
    return (
      <>
        <ExpandableBadge
          testID="tool-call-group"
          label={aggregateSummary}
          originTags={originTags}
          icon={Wrench}
          isLoading={group.isLoading}
          isExpanded={false}
          isLastInSequence={isLastInSequence}
          onToggle={toggle}
          pill
          pillTrailing={failedBadge}
        />
        <OverviewToolCallGroupSheet visible={expanded} summary={aggregateSummary} onClose={close}>
          {children}
        </OverviewToolCallGroupSheet>
      </>
    );
  }

  return (
    <ExpandableBadge
      testID="tool-call-group"
      label={aggregateSummary}
      originTags={originTags}
      icon={Wrench}
      isLoading={group.isLoading}
      isExpanded={expanded}
      isLastInSequence={isLastInSequence}
      onToggle={toggle}
      renderDetails={renderDetails}
      borderlessWhenExpanded
      pill
      pillTrailing={failedBadge}
      animateDetails
    />
  );
});

const styles = StyleSheet.create((theme) => ({
  scroll: {
    maxHeight: TOOL_CALL_GROUP_MAX_HEIGHT,
  },
  content: {
    paddingTop: theme.spacing[1],
    paddingHorizontal: 13,
  },
}));
