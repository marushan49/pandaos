import { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronDown, ChevronRight, CircleDot, Focus } from "@/components/icons/ui-icons";
import { LiveElapsed } from "@/components/message";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { Button } from "@/components/ui/button";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { mutedIconColorMapping } from "@/components/ui/icon-button-chrome";
import { TaskListRow } from "@/components/task-list-row";
import { useSessionStore, selectAgentTurnPresentation } from "@/stores/session-store";
import { getFocusedAgentId, useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { selectWorkspacePlanAgentId } from "@/utils/workspace-agent-activity";
import { buildWorkingLabel, resolveWorkingTool } from "@/agent-stream/working-status";
import type { StreamItem } from "@/types/stream";

const ThemedFocus = withUnistyles(Focus);
const ThemedCircleDot = withUnistyles(CircleDot);
const EMPTY_STREAM: StreamItem[] = [];

export function WorkspaceTaskPlan({
  serverId,
  workspaceId,
}: {
  serverId: string;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const panelActive = useRetainedPanelActive();
  const [expanded, setExpanded] = useState(true);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const workspaceKey = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
  const focusedAgentId = useWorkspaceLayoutStore((state) =>
    getFocusedAgentId(workspaceKey ? state.layoutByWorkspace[workspaceKey] : null),
  );
  const agentId = useSessionStore((state) =>
    selectWorkspacePlanAgentId(state.sessions[serverId]?.agents, workspaceId, focusedAgentId),
  );
  const tasks = useSessionStore((state) =>
    agentId ? state.sessions[serverId]?.agentTasks.get(agentId) : undefined,
  );
  const head = useSessionStore((state) =>
    agentId
      ? (state.sessions[serverId]?.agentStreamHead.get(agentId) ?? EMPTY_STREAM)
      : EMPTY_STREAM,
  );
  const tail = useSessionStore((state) =>
    agentId
      ? (state.sessions[serverId]?.agentStreamTail.get(agentId) ?? EMPTY_STREAM)
      : EMPTY_STREAM,
  );
  const request = useMemo(() => {
    const message =
      head.findLast((item) => item.kind === "user_message") ??
      tail.findLast((item) => item.kind === "user_message");
    return message?.kind === "user_message" ? message.text.trim() : "";
  }, [head, tail]);
  const startedAt = useSessionStore((state) => {
    if (!agentId) return null;
    return selectAgentTurnPresentation(state.sessions[serverId], agentId).startedAt;
  });
  const status = useSessionStore((state) => {
    if (!agentId) return t("sessions.empty");
    const session = state.sessions[serverId];
    const current = session?.agents.get(agentId);
    if (!current) return t("sessions.empty");
    if (current.status === "error" || current.attentionReason === "error")
      return t("sidebar.status.failed");
    const turn = selectAgentTurnPresentation(session, agentId);
    const needsInput =
      current.pendingPermissions.length > 0 || current.attentionReason === "permission";
    const tool = resolveWorkingTool(session?.agentStreamTail.get(agentId) ?? EMPTY_STREAM, turn);
    const working = buildWorkingLabel(t, turn, needsInput, tool, 0);
    if (working) return working;
    if (current.requiresAttention) return t("sidebar.status.attention");
    return t(`agentList.status.${current.status === "running" ? "idle" : current.status}`);
  });
  const completedTasks = useMemo(
    () => tasks?.filter((task) => task.completed || task.status === "completed") ?? [],
    [tasks],
  );
  const openTasks = useMemo(
    () => tasks?.filter((task) => !task.completed && task.status !== "completed") ?? [],
    [tasks],
  );
  const activeTask = openTasks.find((task) => task.status === "in_progress") ?? openTasks[0];
  const remainingTasks = openTasks.filter((task) => task !== activeTask);
  const progress = tasks?.length
    ? t("message.todo.tasksProgress", { completed: completedTasks.length, total: tasks.length })
    : null;
  const toggle = useCallback(() => setExpanded((value) => !value), []);
  const toggleCompleted = useCallback(() => setCompletedExpanded((value) => !value), []);
  const focus = useCallback(() => {
    if (workspaceKey && agentId)
      useWorkspaceLayoutStore
        .getState()
        .openTab({ workspaceKey, target: { kind: "agent", agentId }, intent: "reveal" });
  }, [agentId, workspaceKey]);
  const expandedState = useMemo(() => ({ expanded }), [expanded]);
  const completedState = useMemo(() => ({ expanded: completedExpanded }), [completedExpanded]);
  const collapseIcon = expanded ? ChevronDown : ChevronRight;
  const completedIcon = completedExpanded ? ChevronDown : ChevronRight;
  const showRequest = !activeTask && completedTasks.length === 0;
  return (
    <ScrollView
      style={styles.plan}
      contentContainerStyle={styles.content}
      nestedScrollEnabled
      testID="workspace-task-plan"
    >
      <View style={styles.card}>
        <View style={styles.header}>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={collapseIcon}
            onPress={toggle}
            accessibilityState={expandedState}
            style={styles.headingButton}
            textStyle={styles.title}
          >
            {t("message.todo.title")}
          </Button>
          {progress ? <Text style={styles.progress}>{progress}</Text> : null}
          {agentId ? (
            <ToolbarButton
              label={t("message.todo.focusSession")}
              onPress={focus}
              testID="workspace-task-plan-focus"
            >
              <ThemedFocus size={16} uniProps={mutedIconColorMapping} />
            </ToolbarButton>
          ) : null}
        </View>
        {expanded ? (
          <View style={styles.body}>
            {activeTask ? (
              <View style={styles.activeTask}>
                <TaskListRow task={activeTask} />
              </View>
            ) : null}
            {showRequest ? (
              <View style={styles.requestRow}>
                {request ? <ThemedCircleDot size={16} uniProps={mutedIconColorMapping} /> : null}
                <Text style={styles.request} numberOfLines={3}>
                  {request || t("message.todo.empty")}
                </Text>
              </View>
            ) : null}
            {agentId ? (
              <View style={styles.activity}>
                <Text style={styles.meta} accessibilityLiveRegion="polite">
                  {status}
                </Text>
                {startedAt ? (
                  <LiveElapsed startedAt={startedAt} active={panelActive} style={styles.elapsed} />
                ) : null}
              </View>
            ) : null}
            {remainingTasks.length > 0 ? (
              <View style={styles.rows}>
                {remainingTasks.map((task) => (
                  <TaskListRow key={task.id ?? task.text} task={task} />
                ))}
              </View>
            ) : null}
            {completedTasks.length > 0 ? (
              <View style={styles.completed}>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={completedIcon}
                  onPress={toggleCompleted}
                  accessibilityState={completedState}
                  style={styles.completedButton}
                  testID="workspace-task-plan-completed"
                >
                  {`${completedTasks.length} ${t("message.todo.activity.completed")}`}
                </Button>
                {completedExpanded ? (
                  <View style={styles.rows}>
                    {completedTasks.map((task) => (
                      <TaskListRow key={task.id ?? task.text} task={task} />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  plan: { flex: 1, minHeight: 0 },
  content: { padding: theme.spacing[4] },
  card: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    borderRadius: theme.borderRadius.xl,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    padding: theme.spacing[2],
  },
  headingButton: { flex: 1, minWidth: 0, justifyContent: "flex-start" },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  progress: {
    marginLeft: "auto",
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    flexShrink: 0,
  },
  body: { padding: theme.spacing[4], paddingTop: theme.spacing[1], gap: theme.spacing[3] },
  activeTask: {
    padding: theme.spacing[3],
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
  },
  requestRow: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing[2] },
  request: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  activity: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
  meta: { flex: 1, color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  elapsed: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.mono,
  },
  rows: { gap: theme.spacing[3] },
  completed: {
    borderTopWidth: 1,
    borderColor: theme.colors.hairline,
    paddingTop: theme.spacing[2],
  },
  completedButton: { alignSelf: "flex-start", marginLeft: -theme.spacing[2] },
}));
