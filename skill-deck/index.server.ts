import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerSkills } from "./server/service";
import { registerPlugins } from "./server/plugins.ts";

export default function contribute(server: PluginServerContext) {
  registerPlugins(server);
  return registerSkills(server);
}
