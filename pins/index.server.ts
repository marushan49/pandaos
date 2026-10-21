import type { PluginServerContext } from "@getpaseo/plugin/server";
import { pinsSettings } from "./shared/pins";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(pinsSettings);
  return () => {};
}
