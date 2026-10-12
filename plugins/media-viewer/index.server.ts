import type { PluginServerContext } from "@getpaseo/plugin/server";
import { browseMedia, readMedia } from "./shared/contracts.js";
import { browse, read } from "./server/media.js";
import { mediaViewerInstruction } from "./server/instruction.js";

export default function contribute(server: PluginServerContext) {
  server.handle(browseMedia, browse);
  server.handle(readMedia, read);
  server.before("agent.create", ({ request }) => ({
    ...request,
    config: {
      ...request.config,
      systemPrompt: [request.config.systemPrompt, mediaViewerInstruction]
        .filter(Boolean)
        .join("\n\n"),
    },
  }));
  return () => {};
}
