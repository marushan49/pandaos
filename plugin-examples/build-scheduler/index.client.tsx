import type { PluginClientContext } from "@getpaseo/plugin/client";
import { BuildQueuePanel } from "./client/panel";

export default function contribute(client: PluginClientContext) {
  const panel = client.addWorkspacePanel({
    id: "build-queue",
    title: "Builds",
    icon: "Hammer",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: BuildQueuePanel,
  });
  const command = client.addCommandCenterItem({
    id: "open-build-queue",
    title: "Build-Queue öffnen",
    icon: "Hammer",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("build-queue");
    },
  });
  return () => {
    panel();
    command();
  };
}
