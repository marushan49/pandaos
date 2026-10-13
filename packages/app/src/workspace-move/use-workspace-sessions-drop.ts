import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import { confirmDialog } from "@/utils/confirm-dialog";
import { flashLandedWorkspace, type WorkspaceDropTarget } from "./drop-target";
import { describeWorkspaceMove, moveWorkspaceSessions } from "./move-sessions";

export function useWorkspaceSessionsDrop(ownWorkspaceIds: readonly string[] = []) {
  const { t } = useTranslation();
  const toast = useToast();
  return useCallback(
    (item: { serverId: string; workspaceId: string }, target: WorkspaceDropTarget) => {
      if (target.workspaceId === item.workspaceId || ownWorkspaceIds.includes(target.workspaceId)) {
        return false;
      }
      if (target.serverId !== item.serverId) {
        toast.error(t("sidebar.project.toasts.moveAcrossHosts"));
        return true;
      }
      const plan = describeWorkspaceMove({
        serverId: item.serverId,
        sourceWorkspaceId: item.workspaceId,
        targetWorkspaceId: target.workspaceId,
      });
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
          const result = await moveWorkspaceSessions({
            serverId: item.serverId,
            sourceWorkspaceId: item.workspaceId,
            targetWorkspaceId: target.workspaceId,
          });
          flashLandedWorkspace(target);
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
