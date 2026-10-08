import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Check, ChevronUp, Clock } from "@/components/icons/ui-icons";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useWorkspaceDoneToggle } from "@/components/workspace-done-button";
import { useToast } from "@/contexts/toast-context";
import type { SidebarWorkspaceEntry } from "@/hooks/sidebar-workspaces-view-model";
import { useAppSettings } from "@/hooks/use-settings";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useSidebarSnoozeEnabled } from "@/sidebar-order-sync/host";
import {
  navigateToWorkspace,
  useIsActiveWorkspace,
} from "@/stores/navigation-active-workspace-store";
import { useSidebarOrderStore } from "@/stores/sidebar-order-store";
import type { Theme } from "@/styles/theme";
import { getStatusDotColor } from "@/utils/status-dot-color";
import { STATUS_INDICATOR_FILLED_DOT_SIZE } from "@/utils/status-indicator-geometry";
import { useSidebarModel } from "./sidebar-model";
import { isSnoozed, snoozeUntilTomorrowMorning, workspaceNeedsYou } from "./sidebar-set-aside";
import { resolveSidebarWorkspacePrimaryLabel } from "./sidebar-workspace-title";

const UNDO_WINDOW_MS = 5000;
const FOLD_DURATION_MS = 280;
const SETTLED_LIST_MAX_HEIGHT = 180;
const foldEasing = Easing.out(Easing.cubic);
const mutedIcon = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedClock = withUnistyles(Clock);
const ThemedChevronUp = withUnistyles(ChevronUp);

function UndoToastContent({
  label,
  restoredLabel,
  undo,
}: {
  label: string;
  restoredLabel: string;
  undo: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const handleUndo = useCallback(() => {
    undo();
    toast.show(restoredLabel);
  }, [restoredLabel, toast, undo]);
  return (
    <View style={styles.toastRow}>
      <Text style={styles.toastText} numberOfLines={1}>
        {label}
      </Text>
      <Button size="xs" variant="secondary" onPress={handleUndo} testID="sidebar-set-aside-undo">
        {t("sidebar.setAside.undo")}
      </Button>
    </View>
  );
}

function useWorkspaceSetAsideActions(workspace: SidebarWorkspaceEntry): {
  onDone?: () => void;
  onSnooze?: () => void;
} {
  const { t } = useTranslation();
  const toast = useToast();
  const {
    settings: { workspaceTitleSource },
  } = useAppSettings();
  const client = useHostRuntimeClient(workspace.serverId);
  const doneToggle = useWorkspaceDoneToggle(workspace.serverId, workspace.workspaceId);
  const snoozeEnabled = useSidebarSnoozeEnabled();
  const setWorkspaceSnooze = useSidebarOrderStore((state) => state.setWorkspaceSnooze);
  const name = resolveSidebarWorkspacePrimaryLabel({ workspace, workspaceTitleSource });
  const { workspaceKey, workspaceId } = workspace;

  const offerUndo = useCallback(
    (label: string, undo: () => void) => {
      const restoredLabel = t("sidebar.setAside.restored", { name });
      toast.show(<UndoToastContent label={label} restoredLabel={restoredLabel} undo={undo} />, {
        durationMs: UNDO_WINDOW_MS,
        testID: "sidebar-set-aside-toast",
      });
    },
    [name, t, toast],
  );

  const onDone = useCallback(() => {
    if (!client) return;
    client.setWorkspaceDone(workspaceId, true).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : String(error));
    });
    offerUndo(t("sidebar.setAside.doneToast", { name }), () => {
      client.setWorkspaceDone(workspaceId, false).catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : String(error));
      });
    });
  }, [client, name, offerUndo, t, toast, workspaceId]);

  const onSnooze = useCallback(() => {
    setWorkspaceSnooze(workspaceKey, snoozeUntilTomorrowMorning(new Date()));
    offerUndo(t("sidebar.setAside.snoozedToast", { name }), () =>
      setWorkspaceSnooze(workspaceKey, null),
    );
  }, [name, offerUndo, setWorkspaceSnooze, t, workspaceKey]);

  return {
    onDone:
      doneToggle && client && (!doneToggle.done || workspaceNeedsYou(workspace.statusBucket))
        ? onDone
        : undefined,
    onSnooze: snoozeEnabled && !workspaceNeedsYou(workspace.statusBucket) ? onSnooze : undefined,
  };
}

export function SidebarWorkspaceSetAsideActions({
  workspace,
  visible,
  isTouchPlatform,
}: {
  workspace: SidebarWorkspaceEntry;
  visible: boolean;
  isTouchPlatform: boolean;
}) {
  const { t } = useTranslation();
  const { onDone, onSnooze } = useWorkspaceSetAsideActions(workspace);
  const active = useIsActiveWorkspace(workspace.serverId, workspace.workspaceId);
  const [focused, setFocused] = useState(false);
  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);
  if (!onDone && !onSnooze) return null;
  if (isTouchPlatform && !active) return null;
  const shown = visible || focused;
  const buttonStyle = isTouchPlatform ? styles.touchAction : styles.hoverAction;
  return (
    <View
      style={shown ? styles.actions : styles.actionsHidden}
      pointerEvents={shown ? "auto" : "none"}
    >
      {onSnooze ? (
        <Button
          variant="ghost"
          size="xs"
          leftIcon={Clock}
          onPress={onSnooze}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={buttonStyle}
          accessibilityLabel={t("sidebar.setAside.snooze")}
          testID={`sidebar-workspace-snooze-${workspace.workspaceKey}`}
        />
      ) : null}
      {onDone ? (
        <Button
          variant="ghost"
          size="xs"
          leftIcon={Check}
          onPress={onDone}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={buttonStyle}
          accessibilityLabel={t("sidebar.setAside.done")}
          testID={`sidebar-workspace-done-${workspace.workspaceKey}`}
        />
      ) : null}
    </View>
  );
}

function NeedsYouDot() {
  return <View style={styles.needsYouDot} />;
}
const needsYouDotElement = <NeedsYouDot />;

function settledRowStyle({ hovered }: { hovered?: boolean }) {
  return [styles.settledRow, hovered && styles.hovered];
}

function settledHeaderStyle({ hovered }: { hovered?: boolean }) {
  return [styles.settledHeader, hovered && styles.hovered];
}

export function SidebarNeedsYouPill() {
  const { t } = useTranslation();
  const { needsYouCount, needsYouOnly, toggleNeedsYouOnly } = useSidebarModel();
  const accessibilityState = useMemo(() => ({ selected: needsYouOnly }), [needsYouOnly]);
  if (needsYouCount === 0 && !needsYouOnly) return null;
  return (
    <Pressable
      onPress={toggleNeedsYouOnly}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      style={styles.pill}
      testID="sidebar-needs-you-filter"
    >
      <StatusBadge
        size="xs"
        variant={needsYouOnly ? "error" : "muted"}
        label={t("sidebar.setAside.needsYou", { count: needsYouCount })}
        leading={needsYouDotElement}
      />
    </Pressable>
  );
}

function SettledRow({ workspace, now }: { workspace: SidebarWorkspaceEntry; now: number }) {
  const {
    settings: { workspaceTitleSource },
  } = useAppSettings();
  const snoozedUntil = useSidebarOrderStore(
    (state) => state.snoozedWorkspaceUntil[workspace.workspaceKey],
  );
  const handlePress = useCallback(() => {
    navigateToWorkspace({ serverId: workspace.serverId, workspaceId: workspace.workspaceId });
  }, [workspace.serverId, workspace.workspaceId]);
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      style={settledRowStyle}
      testID={`sidebar-settled-row-${workspace.workspaceKey}`}
    >
      <Text style={styles.settledRowText} numberOfLines={1}>
        {resolveSidebarWorkspacePrimaryLabel({ workspace, workspaceTitleSource })}
      </Text>
      {!workspace.doneAt && isSnoozed(snoozedUntil, now) ? (
        <ThemedClock size={12} uniProps={mutedIcon} />
      ) : null}
    </Pressable>
  );
}

export function SidebarSettledSection() {
  const { t } = useTranslation();
  const { setAsideWorkspaces } = useSidebarModel();
  const [open, setOpen] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const progress = useSharedValue(0);
  const now = Date.now();

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, { duration: FOLD_DURATION_MS, easing: foldEasing });
  }, [open, progress]);

  const foldStyle = useAnimatedStyle(() => ({
    height: progress.value * contentHeight,
    opacity: progress.value,
  }));
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${(1 - progress.value) * 180}deg` }],
  }));
  const handleContentLayout = useCallback((event: LayoutChangeEvent) => {
    setContentHeight(event.nativeEvent.layout.height);
  }, []);
  const toggle = useCallback(() => setOpen((value) => !value), []);
  const accessibilityState = useMemo(() => ({ expanded: open }), [open]);

  if (setAsideWorkspaces.length === 0) return null;
  return (
    <View style={styles.settledSection} testID="sidebar-settled-section">
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        aria-expanded={open}
        style={settledHeaderStyle}
        testID="sidebar-settled-toggle"
      >
        <Text style={styles.settledHeaderText}>
          {t("sidebar.setAside.settled", { count: setAsideWorkspaces.length })}
        </Text>
        <Animated.View style={chevronStyle}>
          <ThemedChevronUp size={14} uniProps={mutedIcon} />
        </Animated.View>
      </Pressable>
      <Animated.View style={[styles.fold, foldStyle]} pointerEvents={open ? "auto" : "none"}>
        <View style={styles.foldContent} onLayout={handleContentLayout}>
          <ScrollView style={styles.settledList} showsVerticalScrollIndicator={false}>
            {setAsideWorkspaces.map((workspace) => (
              <SettledRow key={workspace.workspaceKey} workspace={workspace} now={now} />
            ))}
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 0,
  },
  actionsHidden: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 0,
    opacity: 0,
  },
  hoverAction: {
    width: 26,
    height: 26,
    minHeight: 26,
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginVertical: -3,
  },
  touchAction: {
    width: 40,
    height: 40,
    minHeight: 40,
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginVertical: -10,
  },
  toastRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    minWidth: 0,
  },
  toastText: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  pill: {
    borderRadius: theme.borderRadius.full,
  },
  needsYouDot: {
    width: STATUS_INDICATOR_FILLED_DOT_SIZE,
    height: STATUS_INDICATOR_FILLED_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    backgroundColor: getStatusDotColor({ theme, bucket: "failed" }) ?? undefined,
  },
  settledSection: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  settledHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 36,
    paddingHorizontal: theme.spacing[4],
  },
  settledHeaderText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  hovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  fold: {
    overflow: "hidden",
  },
  foldContent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: theme.spacing[2],
  },
  settledList: {
    maxHeight: SETTLED_LIST_MAX_HEIGHT,
  },
  settledRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minHeight: 28,
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
  },
  settledRowText: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
