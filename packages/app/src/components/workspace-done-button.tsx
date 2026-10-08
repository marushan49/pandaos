import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable } from "react-native";
import { Check } from "@/components/icons/ui-icons";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";

export interface WorkspaceDoneToggle {
  done: boolean;
  pending: boolean;
  toggle: () => void;
}

export function useWorkspaceDoneToggle(
  serverId: string | null | undefined,
  workspaceId: string | null | undefined,
  doneOverride?: boolean,
): WorkspaceDoneToggle | null {
  const client = useHostRuntimeClient(serverId ?? "");
  const isSupported = useHostFeature(serverId, "workspaceDone");
  const storedDone = useSessionStore((state) =>
    Boolean(state.sessions[serverId ?? ""]?.workspaces.get(workspaceId ?? "")?.doneAt),
  );
  const done = doneOverride ?? storedDone;
  const [pending, setPending] = useState(false);
  const toggle = useCallback(() => {
    if (!client || !workspaceId) return;
    setPending(true);
    client
      .setWorkspaceDone(workspaceId, !done)
      .catch(console.error)
      .finally(() => setPending(false));
  }, [client, done, workspaceId]);

  if (!isSupported || !client || !serverId || !workspaceId) return null;
  return { done, pending, toggle };
}

export function MarkDoneButton({
  serverId,
  workspaceId,
  done,
  size,
  testID,
  showMarkAction = true,
}: {
  serverId: string;
  workspaceId: string;
  done?: boolean;
  size: "xs" | "sm" | "md";
  testID: string;
  showMarkAction?: boolean;
}) {
  const { t } = useTranslation();
  const toggle = useWorkspaceDoneToggle(serverId, workspaceId, done);
  if (!toggle) return null;
  if (toggle.done) {
    return (
      <Pressable
        onPress={toggle.toggle}
        disabled={toggle.pending}
        accessibilityRole="button"
        accessibilityLabel={t("leitstand.board.reopen")}
        testID={`${testID}-reopen`}
      >
        <StatusBadge size="xs" variant="success" label={t("sidebar.setAside.done")} />
      </Pressable>
    );
  }
  if (!showMarkAction) return null;
  return (
    <Button
      variant="ghost"
      size={size}
      leftIcon={Check}
      onPress={toggle.toggle}
      loading={toggle.pending}
      disabled={toggle.pending}
      accessibilityLabel={t("leitstand.board.markDone")}
      testID={`${testID}-done`}
    />
  );
}
