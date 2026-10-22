import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { openProviderAccountForm } from "./provider-account-form";

export function useProviderAccountForm(
  serverId: string,
  snapshot: Parameters<typeof openProviderAccountForm>[0],
  onClose: () => void,
) {
  const { t } = useTranslation();
  const client = useHostRuntimeClient(serverId);
  const { patchConfig } = useDaemonConfig(serverId);
  const { refresh } = useProvidersSnapshot(serverId);
  const [model] = useState(() => openProviderAccountForm(snapshot));
  const complete = useCallback(
    (provider: string) => {
      void refresh([provider]);
      onClose();
    },
    [refresh, onClose],
  );
  const failureMessage = t("providerAccounts.failed");

  useEffect(() => () => model.close(), [model]);
  useEffect(() => {
    model.applyRuntime({ client, patchConfig, complete, failureMessage });
  }, [model, client, patchConfig, complete, failureMessage]);

  const state = useSyncExternalStore(model.subscribe, model.getState, model.getState);
  return { model, state };
}
