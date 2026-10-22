import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import { confirmDialog } from "@/utils/confirm-dialog";
import { flashLandedWorkspace, isWorkspaceDropTarget, type SidebarDropTarget } from "./drop-target";
import {
  createProjectWorkspace,
  describeWorkspaceMove,
  moveWorkspaceSessions,
  workspaceOwnTitle,
  workspaceProjectId,
} from "./move-sessions";

interface DraggedWorkspace {
  serverId: string;
  workspaceId: string;
}

function isOwnTarget(
  item: DraggedWorkspace,
  target: SidebarDropTarget,
  ownWorkspaceIds: readonly string[],
): boolean {
  if (isWorkspaceDropTarget(target)) {
    return target.workspaceId === item.workspaceId || ownWorkspaceIds.includes(target.workspaceId);
  }
  return (
    target.serverId === item.serverId &&
    workspaceProjectId(item.serverId, item.workspaceId) === target.projectId
  );
}

function resolveTargetWorkspace(
  item: DraggedWorkspace,
  target: SidebarDropTarget,
): Promise<string> {
  if (isWorkspaceDropTarget(target)) return Promise.resolve(target.workspaceId);
  return createProjectWorkspace({
    target,
    title: workspaceOwnTitle(item.serverId, item.workspaceId),
  });
}

export function useWorkspaceSessionsDrop(ownWorkspaceIds: readonly string[] = []) {
  const { t } = useTranslation();
  const toast = useToast();
  return useCallback(
    (item: DraggedWorkspace, target: SidebarDropTarget) => {
      if (isOwnTarget(item, target, ownWorkspaceIds)) return false;
      if (target.serverId !== item.serverId) {
        toast.error(t("sidebar.project.toasts.moveAcrossHosts"));
        return true;
      }
      const plan = describeWorkspaceMove({
        serverId: item.serverId,
        sourceWorkspaceId: item.workspaceId,
        target,
      });
      if (plan.sessions === 0 && !isWorkspaceDropTarget(target)) return false;
      void (async () => {
        try {
          if (plan.sessions > 0) {
            const confirmed = await confirmDialog({
              title: t("sidebar.project.confirmations.moveSessionsTitle"),
              message: t("sidebar.project.confirmations.moveSessionsMessage", {
                count: plan.sessions,
                source: plan.source,
                workspace: plan.target,
              }),
              confirmLabel: t("sidebar.project.confirmations.moveSessionsConfirm"),
              cancelLabel: t("sidebar.project.confirmations.cancel"),
            });
            if (!confirmed) return;
          }
          const targetWorkspaceId = await resolveTargetWorkspace(item, target);
          const result = await moveWorkspaceSessions({
            serverId: item.serverId,
            sourceWorkspaceId: item.workspaceId,
            targetWorkspaceId,
          });
          flashLandedWorkspace({ serverId: item.serverId, workspaceId: targetWorkspaceId });
          toast.show(
            t("sidebar.project.toasts.sessionsMovedTo", {
              count: result.moved,
              workspace: plan.target,
            }),
          );
        } catch {
          toast.error(t("sidebar.project.toasts.moveSessionsFailed"));
        }
      })();
      return true;
    },
    [ownWorkspaceIds, t, toast],
  );
}
