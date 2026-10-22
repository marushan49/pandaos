import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Check } from "@/components/icons/ui-icons";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useWorkspaceDoneToggle } from "@/components/workspace-done-button";
import { useToast } from "@/contexts/toast-context";
import type { SidebarWorkspaceEntry } from "@/hooks/sidebar-workspaces-view-model";
import { useAppSettings } from "@/hooks/use-settings";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useIsActiveWorkspace } from "@/stores/navigation-active-workspace-store";
import { getStatusDotColor } from "@/utils/status-dot-color";
import { STATUS_INDICATOR_FILLED_DOT_SIZE } from "@/utils/status-indicator-geometry";
import { useSidebarModel } from "./sidebar-model";
import { workspaceNeedsYou } from "./sidebar-set-aside";
import { resolveSidebarWorkspacePrimaryLabel } from "./sidebar-workspace-title";

const UNDO_WINDOW_MS = 5000;

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
} {
  const { t } = useTranslation();
  const toast = useToast();
  const {
    settings: { workspaceTitleSource },
  } = useAppSettings();
  const client = useHostRuntimeClient(workspace.serverId);
  const doneToggle = useWorkspaceDoneToggle(workspace.serverId, workspace.workspaceId);
  const name = resolveSidebarWorkspacePrimaryLabel({ workspace, workspaceTitleSource });
  const { workspaceId } = workspace;

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

  return {
    onDone:
      doneToggle && client && (!doneToggle.done || workspaceNeedsYou(workspace.statusBucket))
        ? onDone
        : undefined,
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
  const { onDone } = useWorkspaceSetAsideActions(workspace);
  const active = useIsActiveWorkspace(workspace.serverId, workspace.workspaceId);
  const [focused, setFocused] = useState(false);
  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);
  if (!onDone) return null;
  if (isTouchPlatform && !active) return null;
  const shown = visible || focused;
  const buttonStyle = isTouchPlatform ? styles.touchAction : styles.hoverAction;
  const clusterStyle = isTouchPlatform
    ? styles.actions
    : [styles.hoverCluster, !shown && styles.hoverClusterHidden];
  return (
    <View style={clusterStyle} pointerEvents={shown ? "auto" : "none"}>
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
    </View>
  );
}

function NeedsYouDot() {
  return <View style={styles.needsYouDot} />;
}
const needsYouDotElement = <NeedsYouDot />;

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

const styles = StyleSheet.create((theme) => ({
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 0,
  },
  hoverCluster: {
    height: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  hoverClusterHidden: {
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
}));
