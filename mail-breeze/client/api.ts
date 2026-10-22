import { useRpc } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  beginLogin,
  clearDemo,
  connectGmail,
  disconnect,
  dismissTask,
  getState,
  importMail,
  loadDemo,
  savePreferences,
  startTask,
  syncMail,
  type BreezeState,
  type Mail,
  type Preferences,
} from "../shared/contracts";
import { errorMessage, pollInterval } from "./format";

export interface GmailInput {
  account: string;
  query: string;
}

export interface LoginChallenge {
  userCode: string;
  verificationUri: string;
  expiresAt: string;
}

export type BusyKey =
  | "sync"
  | "demo"
  | "clear-demo"
  | "import"
  | "preferences"
  | "login"
  | "gmail"
  | "disconnect"
  | `start:${string}`
  | `dismiss:${string}`;

interface Job {
  key: BusyKey;
  run(): Promise<BreezeState>;
  success?: string;
}

export function useBreeze(hostId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const queryKey = useMemo(() => ["mail-breeze", hostId, "state"] as const, [hostId]);
  const rpcState = useRpc(getState);
  const rpcSave = useRpc(savePreferences);
  const rpcImport = useRpc(importMail);
  const rpcDemo = useRpc(loadDemo);
  const rpcClearDemo = useRpc(clearDemo);
  const rpcStart = useRpc(startTask);
  const rpcDismiss = useRpc(dismissTask);
  const rpcSync = useRpc(syncMail);
  const rpcLogin = useRpc(beginLogin);
  const rpcDisconnect = useRpc(disconnect);
  const rpcGmail = useRpc(connectGmail);
  const [login, setLogin] = useState<LoginChallenge | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loginPending, setLoginPending] = useState(false);

  const query = useQuery({
    queryKey,
    queryFn: () => rpcState({}),
    refetchInterval: (current) => pollInterval(current.state.data),
    refetchOnWindowFocus: true,
  });

  const state = query.data;
  const status = state?.connection.status;

  useEffect(() => {
    if (status === "connected" || status === "error" || status === "disconnected") setLogin(null);
  }, [status]);

  const mutation = useMutation<BreezeState, Error, Job>({
    mutationFn: (job) => job.run(),
    onSuccess: (next, job) => {
      setActionError(null);
      queryClient.setQueryData(queryKey, next);
      if (job.success) toast.show(job.success, { variant: "success" });
    },
    onError: (error) => {
      setActionError(errorMessage(error));
      toast.error(errorMessage(error));
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  let busy: BusyKey | null = mutation.isPending ? (mutation.variables?.key ?? null) : null;
  if (loginPending) busy = "login";
  const submit = mutation.mutate;

  const actions = useMemo(
    () => ({
      sync: () => submit({ key: "sync", run: () => rpcSync({}), success: "Mails synchronisiert" }),
      loadDemo: () =>
        submit({ key: "demo", run: () => rpcDemo({}), success: "Demo-Daten geladen" }),
      clearDemo: () =>
        submit({ key: "clear-demo", run: () => rpcClearDemo({}), success: "Demo-Daten entfernt" }),
      importMail: (mail: Mail, done?: () => void) =>
        submit(
          { key: "import", run: () => rpcImport(mail), success: "Mail importiert" },
          { onSuccess: done },
        ),
      savePreferences: (preferences: Preferences, done?: () => void) =>
        submit(
          {
            key: "preferences",
            run: () => rpcSave(preferences),
            success: "Einstellungen gespeichert",
          },
          { onSuccess: done },
        ),
      start: (taskId: string) =>
        submit({ key: `start:${taskId}`, run: () => rpcStart({ taskId }) }),
      dismiss: (taskId: string) =>
        submit({ key: `dismiss:${taskId}`, run: () => rpcDismiss({ taskId }) }),
      disconnect: () =>
        submit({
          key: "disconnect",
          run: () => rpcDisconnect({}),
          success: "Postfach getrennt",
        }),
      connectGmail: (input: GmailInput, done?: () => void) =>
        submit(
          { key: "gmail", run: () => rpcGmail(input), success: "Gmail verbunden" },
          { onSuccess: done },
        ),
      beginLogin: async () => {
        setActionError(null);
        setLoginPending(true);
        try {
          const challenge = await rpcLogin({});
          setLogin(challenge);
          await queryClient.invalidateQueries({ queryKey });
        } catch (error) {
          setActionError(errorMessage(error));
          toast.error(errorMessage(error));
        } finally {
          setLoginPending(false);
        }
      },
      refresh: () => queryClient.invalidateQueries({ queryKey }),
    }),
    [
      submit,
      queryClient,
      queryKey,
      toast,
      rpcSync,
      rpcDemo,
      rpcClearDemo,
      rpcImport,
      rpcSave,
      rpcStart,
      rpcDismiss,
      rpcLogin,
      rpcDisconnect,
      rpcGmail,
    ],
  );

  const refreshQuery = query.refetch;
  const retry = useCallback(() => {
    void refreshQuery();
  }, [refreshQuery]);

  return {
    state,
    loading: query.isPending,
    error: query.error ? errorMessage(query.error) : null,
    retry,
    busy,
    login,
    actionError,
    setLogin,
    ...actions,
  };
}

export type Breeze = ReturnType<typeof useBreeze>;
