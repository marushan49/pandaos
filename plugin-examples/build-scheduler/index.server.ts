import type { PluginServerContext } from "@getpaseo/plugin/server";
import { buildStatus } from "./server/status";
import { buildStatusRpc } from "./shared/status";

export default function contribute(server: PluginServerContext) {
  server.handle(buildStatusRpc, buildStatus);
  return () => {};
}
