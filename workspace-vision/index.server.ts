import type { PluginServerContext } from "@getpaseo/plugin/server";
import { getVision, saveVision } from "./server/handlers";
import { registerVisionHooks } from "./server/hooks";
import { visionGet, visionSave } from "./shared/vision";

export default function contribute(server: PluginServerContext) {
  registerVisionHooks(server);
  server.handle(visionGet, getVision);
  server.handle(visionSave, saveVision);
  return () => {};
}
