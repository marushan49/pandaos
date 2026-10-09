import { useMutation, useQuery } from "@tanstack/react-query";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useState } from "react";
import {
  dismissRecovery,
  listRecovery,
  resumeRecovery,
  setAutomaticRecovery,
  type RecoveryCandidate,
} from "../shared/contracts";

export type Action = "resume" | "dismiss";

function useAgentRefresh(refetch: () => unknown) {
  const paseo = usePaseo();
  useEffect(() => {
    const signatures = new Map<string, string>();
    return paseo.agents.subscribe((update) => {
      if (update.kind === "remove") {
        signatures.delete(update.agentId);
        void refetch();
        return;
      }
      const signature = JSON.stringify([
        update.agent.status,
        update.agent.lastError,
        update.agent.archivedAt,
      ]);
      if (signatures.get(update.agent.id) === signature) return;
      signatures.set(update.agent.id, signature);
      void refetch();
    });
  }, [paseo, refetch]);
}

export function useRecovery(hostId: string) {
  const list = useRpc(listRecovery);
  const resume = useRpc(resumeRecovery);
  const dismiss = useRpc(dismissRecovery);
  const setAutomatic = useRpc(setAutomaticRecovery);
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["session-recovery", hostId],
    queryFn: () => list({}),
    refetchOnWindowFocus: false,
    retry: false,
  });
  const refetch = query.refetch;
  const mutation = useMutation({
    mutationFn: async ({ record, action }: { record: RecoveryCandidate; action: Action }) => {
      const selection = { agentId: record.agentId, revision: record.revision };
      if (action === "resume") await resume(selection);
      else await dismiss(selection);
      return { record, action };
    },
    onSuccess: async ({ record, action }) => {
      setNotice(
        action === "resume"
          ? `${record.title ?? "Session"}: Weiterarbeiten wurde gesendet.`
          : "Eintrag wurde ausgeblendet.",
      );
      await refetch();
    },
    onError: async () => {
      await refetch();
    },
  });
  const automaticMutation = useMutation({
    mutationFn: (enabled: boolean) => setAutomatic({ enabled }),
    onSettled: async () => {
      await refetch();
    },
  });
  const mutate = mutation.mutate;
  const onAction = useCallback(
    (record: RecoveryCandidate, action: Action) => {
      setNotice("");
      mutate({ record, action });
    },
    [mutate],
  );
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);
  useAgentRefresh(refetch);
  const automaticEnabled = automaticMutation.isPending
    ? Boolean(automaticMutation.variables)
    : (query.data?.automatic.enabled ?? false);
  return {
    query,
    notice,
    onAction,
    refresh,
    actionPending: mutation.isPending,
    actionError: mutation.error,
    automaticEnabled,
    automaticPending: automaticMutation.isPending,
    automaticError: automaticMutation.error,
    toggleAutomatic: automaticMutation.mutate,
  };
}
