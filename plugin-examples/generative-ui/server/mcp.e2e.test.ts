import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { costSimulator } from "../shared/demo";
import { surfaceSchema } from "../shared/surface";

describe("present_ui over real MCP stdio", () => {
  it("advertises a schema, returns a portable snapshot and rejects executable data", async () => {
    const client = new Client({ name: "pandaos-ui-check", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL("../dist/mcp.mjs", import.meta.url))],
      stderr: "pipe",
    });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(["present_ui"]);
      const response = await client.callTool({ name: "present_ui", arguments: costSimulator });
      expect(response.isError).not.toBe(true);
      expect(surfaceSchema.parse(response.structuredContent)).toEqual(costSimulator);
      expect(response.content).toEqual([
        { type: "text", text: expect.stringContaining("```pandaos-ui") },
      ]);
      const invalid = await client.callTool({
        name: "present_ui",
        arguments: { ...costSimulator, actions: ["execute_js"] },
      });
      expect(invalid.isError).toBe(true);
    } finally {
      await client.close();
    }
  }, 20000);
});
