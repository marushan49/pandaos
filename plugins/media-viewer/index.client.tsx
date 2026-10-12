import type { PluginClientContext } from "@getpaseo/plugin/client";
import { MediaPanel } from "./client/panel.js";
import { selectMedia } from "./client/selection.js";

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: "viewer",
    title: "Media viewer",
    icon: "Images",
    context: "workspace",
    Component: MediaPanel,
  });
  client.addCommandCenterItem({
    id: "open-viewer",
    title: "Open media viewer",
    icon: "Images",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("viewer");
    },
  });
  client.addSlashCommand({
    name: "media",
    description: "Open a picture or video in its own workspace tab",
    argumentHint: "<absolute file path>",
    context: "workspace",
    onSubmit({ args, workspace, openPanel }) {
      selectMedia(workspace.id, args.trim());
      openPanel("viewer");
    },
  });
  return () => {};
}
