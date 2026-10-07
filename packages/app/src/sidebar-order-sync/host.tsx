import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useHostFeatureMap } from "@/runtime/host-features";
import { useHostRuntimeClient, useHostRuntimeIsConnected, useHosts } from "@/runtime/host-runtime";
import { useSidebarOrderStore } from "@/stores/sidebar-order-store";
import { selectSidebarOrderHost, startSidebarOrderSync, type SidebarOrderSyncClient } from "./sync";

const UPLOAD_DEBOUNCE_MS = 500;

function toSyncClient(client: DaemonClient): SidebarOrderSyncClient {
  return {
    getSidebarOrder: () => client.getSidebarOrder(),
    setSidebarOrder: (input) => client.setSidebarOrder(input),
    observeSidebarOrder: (listener) => {
      const feed = client.observeEvents(["sidebar.order.changed"]);
      const unsubscribe = feed.subscribe({
        snapshot: () => {},
        update: (message) => {
          if (message.type === "sidebar.order.changed") listener(message.payload);
        },
      });
      return () => {
        unsubscribe();
        void feed
          .release()
          .catch((error) => console.warn("[SidebarOrderSync] Failed to release the feed", error));
      };
    },
  };
}

function reportSyncError(error: unknown): void {
  console.warn("[SidebarOrderSync] Sync with the canonical host failed", error);
}

function SidebarOrderSyncConnection({ serverId }: { serverId: string }) {
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);

  useEffect(() => {
    if (!client || !isConnected) return;
    return startSidebarOrderSync({
      serverId,
      store: useSidebarOrderStore,
      client: toSyncClient(client),
      debounceMs: UPLOAD_DEBOUNCE_MS,
      onError: reportSyncError,
    });
  }, [client, isConnected, serverId]);

  return null;
}

export function SidebarOrderSyncHost() {
  const hosts = useHosts();
  const serverIds = useMemo(() => hosts.map((host) => host.serverId), [hosts]);
  const supportByServerId = useHostFeatureMap(serverIds, "sidebarOrder");
  const hasHydrated = useSyncExternalStore(
    useSidebarOrderStore.persist.onFinishHydration,
    useSidebarOrderStore.persist.hasHydrated,
    () => false,
  );
  const serverId = selectSidebarOrderHost(
    serverIds,
    (candidate) => supportByServerId.get(candidate) === true,
  );

  if (!hasHydrated || !serverId) return null;
  return <SidebarOrderSyncConnection key={serverId} serverId={serverId} />;
}
