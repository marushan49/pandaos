import type { PluginScreenProps, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { BreezeApp } from "./main";

export function BreezeScreen(props: PluginScreenProps) {
  return <BreezeApp {...props} mode="screen" />;
}

export function BreezePanel(props: PluginWorkspacePanelProps) {
  return <BreezeApp {...props} mode="panel" />;
}
