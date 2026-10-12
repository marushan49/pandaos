import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useCallback } from "react";
import { useHostSnapshot } from "./use-host";

export function HostFooterItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  const { data } = useHostSnapshot();
  const openHost = useCallback(() => openScreen({ screenId: "host" }), [openScreen]);
  return (
    <SidebarRow
      id="host"
      icon="Gauge"
      label={data ? `${data.memory.availableGb.toFixed(1)} GB free` : "Host"}
      active={currentScreen?.screenId === "host"}
      onPress={openHost}
    />
  );
}
