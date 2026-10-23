import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useCallback } from "react";
import { useHostBuilds, useHostSnapshot } from "./use-host";

export function HostFooterItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  const { data } = useHostSnapshot();
  const { data: builds } = useHostBuilds();
  const active = (builds?.running ?? 0) + (builds?.queued ?? 0);
  const free = data ? `${data.memory.availableGb.toFixed(1)} GB free` : "Host";
  const label = active ? `${free} · ${active} ${active === 1 ? "build" : "builds"}` : free;
  const openHost = useCallback(() => openScreen({ screenId: "host" }), [openScreen]);
  return (
    <SidebarRow
      id="host"
      icon="Gauge"
      label={label}
      active={currentScreen?.screenId === "host"}
      onPress={openHost}
    />
  );
}
