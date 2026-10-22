import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useCallback } from "react";
import { BreezePanel, BreezeScreen } from "./client/screen";
import { syncMail } from "./shared/contracts";

function BreezeItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  const open = useCallback(() => openScreen({ screenId: "main" }), [openScreen]);
  return (
    <SidebarRow
      icon="Wind"
      label="Mail Breeze"
      active={currentScreen?.screenId === "main"}
      onPress={open}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "main", title: "Mail Breeze", Component: BreezeScreen });
  client.addSidebarHeaderItem({ id: "main", title: "Mail Breeze", Component: BreezeItem });
  client.addWorkspacePanel({
    id: "panel",
    title: "Mail Breeze",
    icon: "Wind",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: BreezePanel,
  });
  client.addCommandCenterItem({
    id: "open",
    title: "Mail Breeze öffnen",
    icon: "Wind",
    keywords: ["mail", "gmail", "outlook", "aufgaben", "posteingang", "breeze"],
    context: "global",
    onSelect: ({ openScreen }) => openScreen({ screenId: "main" }),
  });
  client.addCommandCenterItem({
    id: "sync",
    title: "Postfach jetzt lesen",
    icon: "RefreshCw",
    keywords: ["mail", "gmail", "outlook", "sync", "abrufen", "lesen"],
    context: "global",
    onSelect: async ({ rpc, openScreen }) => {
      await rpc(syncMail, {});
      openScreen({ screenId: "main" });
    },
  });
  client.addCommandCenterItem({
    id: "import",
    title: "Mail manuell importieren",
    icon: "ClipboardPaste",
    keywords: ["mail", "einfügen", "import", "aufgabe"],
    context: "global",
    onSelect: ({ openScreen }) =>
      openScreen({ screenId: "main", params: { action: "import", nonce: String(Date.now()) } }),
  });
  return () => {};
}
