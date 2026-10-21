import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useCallback } from "react";
import { Tracker } from "./client/tracker.tsx";

function SidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  const open = useCallback(() => openScreen({ screenId: "main" }), [openScreen]);
  return (
    <SidebarRow
      icon="ChartCandlestick"
      label="Aktien"
      active={currentScreen?.screenId === "main"}
      onPress={open}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "main", title: "Aktien-Alerts", Component: Tracker });
  client.addSidebarHeaderItem({ id: "main", title: "Aktien", Component: SidebarItem });
  return () => {};
}
