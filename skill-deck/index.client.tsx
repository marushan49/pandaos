import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useCallback } from "react";
import { Deck } from "./client/deck.tsx";

function SidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  const open = useCallback(() => openScreen({ screenId: "main" }), [openScreen]);
  return (
    <SidebarRow
      icon="Library"
      label="Plugins & Skills"
      active={currentScreen?.screenId === "main"}
      onPress={open}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "main", title: "Plugins & Skills", Component: Deck });
  client.addSidebarHeaderItem({ id: "main", title: "Plugins & Skills", Component: SidebarItem });
  return () => {};
}
