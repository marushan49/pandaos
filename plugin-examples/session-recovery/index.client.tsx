import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useCallback } from "react";
import { RecoveryEventRow } from "./client/recovery-event-row";
import { RecoveryScreen } from "./client/screen";
import { listRecovery, RecoveryEventSchema } from "./shared/contracts";

function RecoveryItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  const open = useCallback(() => openScreen({ screenId: "recovery" }), [openScreen]);
  return (
    <SidebarRow icon="RotateCcw" active={currentScreen?.screenId === "recovery"} onPress={open} />
  );
}

export default function contribute(client: PluginClientContext) {
  const removers = [
    client.addScreen({
      id: "recovery",
      title: "Unterbrochene Sessions",
      Component: RecoveryScreen,
    }),
    client.addSidebarHeaderItem({
      id: "recovery",
      title: "Unterbrochene Sessions",
      Component: RecoveryItem,
    }),
    client.addCommandCenterItem({
      id: "recovery",
      title: "Unterbrochene Sessions",
      icon: "RotateCcw",
      context: "global",
      onSelect: ({ openScreen }) => openScreen({ screenId: "recovery" }),
    }),
    client.addTimelineRenderer({
      kind: "recovery-event",
      version: 1,
      schema: RecoveryEventSchema,
      Component: RecoveryEventRow,
    }),
  ];
  void client
    .rpc(listRecovery, {})
    .catch((error) => console.error("Recovery konnte nicht initialisiert werden", error));
  return () => {
    for (const remove of removers) remove();
  };
}
