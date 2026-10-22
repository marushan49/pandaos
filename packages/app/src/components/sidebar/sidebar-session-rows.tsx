import { memo, useCallback, useMemo, useState } from "react";
import type { PressableStateCallbackType } from "react-native";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { WorkspaceStatusIndicator } from "@/components/sidebar/sidebar-workspace-row-content";
import { isWeb } from "@/constants/platform";
import type { SidebarWorkspaceEntry } from "@/hooks/sidebar-workspaces-view-model";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { getFocusedAgentId } from "@/stores/workspace-layout-actions";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { density, densityFontSize, densityIconBox } from "@/styles/density";
import { selectionTint } from "@/styles/with-alpha";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import type { WorkspaceSessionRow } from "@/utils/workspace-agent-activity";
import { encodeWorkspaceDropTarget } from "@/workspace-move/drop-target";

export function SidebarSessionRows({
  workspace,
  onPress,
}: {
  workspace: SidebarWorkspaceEntry;
  onPress?: () => void;
}) {
  if (!workspace.sessions?.length) return null;
  return <SessionRowList workspace={workspace} sessions={workspace.sessions} onPress={onPress} />;
}

function SessionRowList({
  workspace,
  sessions,
  onPress,
}: {
  workspace: SidebarWorkspaceEntry;
  sessions: readonly WorkspaceSessionRow[];
  onPress?: () => void;
}) {
  const activeWorkspace = useActiveWorkspaceSelection();
  const isActiveWorkspace =
    activeWorkspace?.serverId === workspace.serverId &&
    activeWorkspace?.workspaceId === workspace.workspaceId;
  const focusedAgentId = useWorkspaceLayoutStore((state) =>
    isActiveWorkspace ? getFocusedAgentId(state.layoutByWorkspace[workspace.workspaceKey]) : null,
  );
  const dropTargetDataSet = useMemo(
    () => ({
      workspaceDropTarget: encodeWorkspaceDropTarget({
        serverId: workspace.serverId,
        workspaceId: workspace.workspaceId,
      }),
    }),
    [workspace.serverId, workspace.workspaceId],
  );
  return (
    <View dataSet={dropTargetDataSet}>
      {sessions.map((session, index) => (
        <SessionRow
          isLast={index === sessions.length - 1}
          key={session.agentId}
          serverId={workspace.serverId}
          workspaceId={workspace.workspaceId}
          session={session}
          selected={focusedAgentId === session.agentId}
          onPress={onPress}
        />
      ))}
    </View>
  );
}

const SessionRow = memo(function SessionRow({
  serverId,
  workspaceId,
  session,
  selected,
  isLast,
  onPress,
}: {
  serverId: string;
  workspaceId: string;
  session: WorkspaceSessionRow;
  selected: boolean;
  isLast: boolean;
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const handlePress = useCallback(() => {
    onPress?.();
    navigateToAgent({ serverId, agentId: session.agentId, workspaceId });
  }, [onPress, serverId, session.agentId, workspaceId]);
  const title = session.title?.trim() || t("sidebar.sessions.untitled");
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const rowStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.row,
      isHovered && styles.rowHovered,
      selected && styles.rowSelected,
      pressed && styles.rowPressed,
    ],
    [isHovered, selected],
  );

  return (
    <View
      style={styles.container}
      onPointerEnter={isWeb ? handlePointerEnter : undefined}
      onPointerLeave={isWeb ? handlePointerLeave : undefined}
    >
      <View style={styles.treeRail}>
        {isLast ? null : <View style={styles.treeTrunk} />}
        <View style={styles.treeElbow} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        accessibilityLabel={title}
        onPress={handlePress}
        testID={`sidebar-session-row-${session.agentId}`}
        style={rowStyle}
      >
        <Text
          style={[styles.title, (isHovered || selected) && styles.titleActive]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <WorkspaceStatusIndicator bucket={session.status} reserveIdleSpace={false} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    position: "relative",
    flexDirection: "row",
    paddingLeft: theme.spacing[2] + theme.spacing[4],
    marginBottom: theme.spacing[0.5],
  },
  row: {
    flex: 1,
    minWidth: 0,
    minHeight: density.rowHeight,
    paddingVertical: theme.spacing[1],
    paddingLeft: theme.spacing[2],
    paddingRight: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    userSelect: "none",
  },
  treeRail: {
    width: densityIconBox("md"),
    alignSelf: "stretch",
    marginTop: -theme.spacing[0.5],
    marginBottom: -theme.spacing[0.5],
    flexShrink: 0,
  },
  treeTrunk: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: theme.colors.foregroundExtraMuted,
  },
  treeElbow: {
    position: "absolute",
    left: "50%",
    top: 0,
    right: 0,
    height: "50%",
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.foregroundExtraMuted,
    borderBottomLeftRadius: theme.borderRadius.md,
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  rowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  rowSelected: {
    backgroundColor: selectionTint({
      accent: theme.colors.accent,
      surface: theme.colors.surfaceSidebar,
      isWeb,
    }),
    boxShadow: `inset 3px 0 0 ${theme.colors.accent}`,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: densityFontSize(theme, "base"),
    lineHeight: density.rowLineHeight,
    opacity: 0.76,
  },
  titleActive: {
    opacity: 1,
  },
}));
