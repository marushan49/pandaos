import type { PluginClientContext } from "@getpaseo/plugin/client";
import { VisionPanel } from "./client/panel";

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: "vision",
    title: "Vision",
    icon: "Target",
    context: "workspace",
    Component: VisionPanel,
  });
  return () => {};
}
