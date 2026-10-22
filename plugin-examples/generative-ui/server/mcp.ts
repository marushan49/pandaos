import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { surfaceSchema, surfaceText } from "../shared/surface";

export function createUiServer() {
  const server = new McpServer({ name: "pandaos-generative-ui", version: "0.1.0" });
  server.registerTool(
    "present_ui",
    {
      description:
        "Present a PandaOS UI v1 snapshot. Only bounded numeric inputs, local arithmetic, notes, metrics, tables and bar charts are allowed. Supply a readable fallback, unique id per source, and a new revision when changing the snapshot. No JavaScript, HTML, URLs, shell, remote actions or automatic submissions. For streaming publish complete snapshots; do not resend this UI as assistant text after a successful tool result.",
      inputSchema: surfaceSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (surface) => ({
      content: [{ type: "text", text: surfaceText(surface) }],
      structuredContent: surface,
    }),
  );
  return server;
}

await createUiServer().connect(new StdioServerTransport());
