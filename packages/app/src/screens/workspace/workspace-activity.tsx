import { useCallback, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useShallow } from "zustand/shallow";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { BrowserActivityEvent } from "@getpaseo/protocol/browser-activity/rpc-schemas";
import { ChevronDown, ChevronRight, Focus, Pause, Play, X } from "@/components/icons/ui-icons";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { mutedIconColorMapping } from "@/components/ui/icon-button-chrome";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useHostFeature } from "@/runtime/host-features";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { useBrowserStore } from "@/desktop/browser/store";
import { BrowserActivitySteps } from "@/desktop/browser/activity-steps";
import {
  summarizeBrowserActivity,
  useBrowserActivityStore,
  workspaceBrowserActivities,
} from "@/desktop/browser/activity";

const ThemedFocus = withUnistyles(Focus);
const ThemedPause = withUnistyles(Pause);
const ThemedPlay = withUnistyles(Play);
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedX = withUnistyles(X);

export function WorkspaceActivity({
  serverId,
  workspaceId,
}: {
  serverId: string;
  workspaceId: string;
}) {
  const runs = useBrowserActivityStore(
    useShallow((state) => workspaceBrowserActivities(state.byBrowser, serverId, workspaceId)),
  );
  if (runs.length === 0) return null;
  return (
    <ScrollView style={styles.runs} nestedScrollEnabled testID="workspace-activity">
      {runs.map((activity) => (
        <WorkspaceBrowserRun key={activity.runId} serverId={serverId} activity={activity} />
      ))}
    </ScrollView>
  );
}

function WorkspaceBrowserRun({
  serverId,
  activity,
}: {
  serverId: string;
  activity: BrowserActivityEvent;
}) {
  const { t } = useTranslation();
  const client = useHostRuntimeClient(serverId);
  const canSkip = useHostFeature(serverId, "browserActivitySkip");
  const [expanded, setExpanded] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const followStep = useCallback(
    (y: number) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: false }),
    [],
  );
  const active = activity.phase !== "finished";
  const takenOver = activity.phase === "paused" || activity.pauseRequested;
  const summary = summarizeBrowserActivity(activity, t);
  const toggle = useCallback(() => setExpanded((value) => !value), []);
  const focusBrowser = useCallback(() => {
    const workspaceKey = buildWorkspaceTabPersistenceKey({
      serverId,
      workspaceId: activity.workspaceId,
    });
    if (!workspaceKey) return;
    const layout = useWorkspaceLayoutStore.getState();
    const browsers = useBrowserStore.getState();
    const tab = layout
      .getWorkspaceTabs(workspaceKey)
      .find(
        ({ target }) =>
          target.kind === "browser" &&
          (target.browserId === activity.browserId ||
            browsers.browsersById[target.browserId]?.remoteBrowserId === activity.browserId),
      );
    if (tab) {
      layout.focusTab(workspaceKey, tab.tabId);
      return;
    }
    browsers.upsertRemoteBrowser({ browserId: activity.browserId, url: "about:blank" });
    layout.openTab({
      workspaceKey,
      target: { kind: "browser", browserId: activity.browserId },
      intent: "reveal",
    });
  }, [activity.browserId, activity.workspaceId, serverId]);
  const control = useCallback(
    async (action: "pause" | "resume" | "skip", step?: number) => {
      if (!client || pending) return;
      setPending(true);
      setError(null);
      try {
        const response = await client.controlBrowserActivity({
          workspaceId: activity.workspaceId,
          browserId: activity.browserId,
          action,
          runId: activity.runId,
          ...(step !== undefined ? { step } : {}),
        });
        if (!response.applied) setError(t("workspace.browser.activity.controlStale"));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setPending(false);
      }
    },
    [activity.browserId, activity.runId, activity.workspaceId, client, pending, t],
  );
  const takeOver = useCallback(() => {
    void control(takenOver ? "resume" : "pause");
  }, [control, takenOver]);
  const skip = useCallback(
    (step: number) => {
      void control("skip", step);
    },
    [control],
  );
  const dismiss = useCallback(
    () => useBrowserActivityStore.getState().dismiss(serverId, activity),
    [activity, serverId],
  );
  const expandedState = useMemo(() => ({ expanded }), [expanded]);
  return (
    <View style={styles.run}>
      <View style={styles.header}>
        <ToolbarButton
          label={t("workspace.browser.activity.openSteps")}
          onPress={toggle}
          accessibilityState={expandedState}
        >
          {expanded ? (
            <ThemedChevronDown size={14} uniProps={mutedIconColorMapping} />
          ) : (
            <ThemedChevronRight size={14} uniProps={mutedIconColorMapping} />
          )}
        </ToolbarButton>
        <Text numberOfLines={1} style={styles.title}>
          {activity.label}
        </Text>
        <ToolbarButton
          label={t("workspace.browser.handoff.openBrowser")}
          onPress={focusBrowser}
          testID="workspace-browser-activity-focus"
        >
          <ThemedFocus size={14} uniProps={mutedIconColorMapping} />
        </ToolbarButton>
        {active ? (
          <ToolbarButton
            label={t(
              takenOver
                ? "workspace.browser.activity.resume"
                : "workspace.browser.activity.takeOver",
            )}
            onPress={takeOver}
            disabled={pending || !client}
          >
            {takenOver ? (
              <ThemedPlay size={14} uniProps={mutedIconColorMapping} />
            ) : (
              <ThemedPause size={14} uniProps={mutedIconColorMapping} />
            )}
          </ToolbarButton>
        ) : (
          <ToolbarButton label={t("workspace.browser.activity.dismiss")} onPress={dismiss}>
            <ThemedX size={14} uniProps={mutedIconColorMapping} />
          </ToolbarButton>
        )}
      </View>
      <Text style={styles.summary} accessibilityLiveRegion="polite">
        {summary}
      </Text>
      {expanded ? (
        <ScrollView ref={scrollRef} style={styles.steps} nestedScrollEnabled>
          <BrowserActivitySteps
            activity={activity}
            onSkip={canSkip && active && client ? skip : undefined}
            disabled={pending}
            onActiveLayout={followStep}
          />
        </ScrollView>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  runs: {
    flexShrink: 1,
    flexGrow: 0,
    maxHeight: 320,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  run: { padding: theme.spacing[2], gap: theme.spacing[1] },
  header: { flexDirection: "row", alignItems: "center", gap: theme.spacing[1] },
  title: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  summary: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  steps: { maxHeight: 200 },
  error: { color: theme.colors.statusDanger, fontSize: theme.fontSize.sm },
}));
