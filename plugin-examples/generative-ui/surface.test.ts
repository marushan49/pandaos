import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { costSimulator } from "./shared/demo";
import {
  calculate,
  initialValues,
  parseNumericInput,
  parseSurface,
  surfaceSchema,
  surfaceText,
} from "./shared/surface";
import { createSpec } from "./client/spec";
import { readSurfaceMessage, transformAssistant, transformTool } from "./client/transform";
import { SurfaceStore } from "./server/store";

describe("generative UI boundary", () => {
  it("accepts decimal commas and negative numbers, rejects nondecimal and empty text", () => {
    expect(parseNumericInput("1,5")).toBe(1.5);
    expect(parseNumericInput("-3.5")).toBe(-3.5);
    expect(parseNumericInput("0x10")).toBeNaN();
    expect(parseNumericInput(" ")).toBeNaN();
  });
  it("calculates the demo and recomputes the entire comparison after an edit", () => {
    const original = initialValues(costSimulator);
    expect(calculate(costSimulator, original).total).toBe(80);
    const changed = calculate(costSimulator, { ...original, requests: 20000 });
    expect(changed.total).toBe(140);
    expect(createSpec(costSimulator, changed).elements["block-1"].props.text).toBe("$140.00");
    expect(createSpec(costSimulator, changed).elements["block-3"].props.rows).toMatchObject([
      { cells: [{ text: "Usage" }, { text: "120" }] },
      { cells: [{ text: "Fixed" }, { text: "20" }] },
      { cells: [{ text: "Total" }, { text: "140" }] },
    ]);
    expect(original.requests).toBe(10000);
    expect(Object.keys(createSpec(costSimulator, null).elements)).toEqual([
      "root",
      "input-0",
      "input-1",
      "input-2",
      "input-3",
      "block-0",
    ]);
  });

  it.each([
    ["unknown version", { ...costSimulator, version: 2 }],
    ["HTML", { ...costSimulator, blocks: [{ type: "HTML", text: "<script>run()</script>" }] }],
    ["external actions", { ...costSimulator, actions: ["shell"] }],
    ["state injection", { ...costSimulator, on: { press: { action: "setState" } } }],
    [
      "expressions",
      {
        ...costSimulator,
        blocks: [
          { type: "Metric", label: "Unsafe", value: { $state: "/secret" }, format: "number" },
        ],
      },
    ],
    [
      "forward reference",
      {
        ...costSimulator,
        calculations: [
          { id: "a", operation: "sum", values: [{ ref: "b" }, 1] },
          { id: "b", operation: "sum", values: [{ ref: "a" }, 1] },
        ],
      },
    ],
    [
      "invalid input",
      { ...costSimulator, inputs: [{ ...costSimulator.inputs[0], min: 10, max: 0 }] },
    ],
    [
      "duplicate id",
      { ...costSimulator, inputs: [costSimulator.inputs[0], costSimulator.inputs[0]] },
    ],
    ["too many controls", { ...costSimulator, inputs: Array(17).fill(costSimulator.inputs[0]) }],
    [
      "ragged table",
      {
        ...costSimulator,
        blocks: [{ type: "Table", label: "Data", columns: ["A", "B"], rows: [[1]] }],
      },
    ],
    [
      "initial division by zero",
      { ...costSimulator, calculations: [{ id: "total", operation: "ratio", values: [1, 0] }] },
    ],
  ])("rejects %s", (_, input) => {
    expect(surfaceSchema.safeParse(input).success).toBe(false);
  });

  it("bounds UTF-8 data before JSON parsing and rejects malformed and oversized input", () => {
    expect(() => parseSurface("{")).toThrow();
    expect(() => parseSurface("é".repeat(25000))).toThrow("48 KiB");
    const oversized = {
      ...costSimulator,
      fallback: "é".repeat(8000),
      blocks: Array.from({ length: 16 }, () => ({ type: "Note", text: "é".repeat(4000) })),
    };
    expect(() => parseSurface(JSON.stringify(oversized))).toThrow("48 KiB");
    expect(() =>
      calculate(costSimulator, { ...initialValues(costSimulator), requests: Infinity }),
    ).toThrow();
    expect(() => calculate(costSimulator, {})).toThrow("Input set has changed");
  });
});

describe("timeline streaming and replay", () => {
  const message = surfaceText(costSimulator);
  it("preserves ordinary prose, unsupported versions, invalid and incomplete data", () => {
    expect(readSurfaceMessage("ordinary chat")).toBeUndefined();
    expect(readSurfaceMessage(message.slice(0, -2))).toBeUndefined();
    expect(readSurfaceMessage(message.replace('"version":1', '"version":2'))).toBeUndefined();
    expect(readSurfaceMessage(`${message}\n${message}`)).toBeUndefined();
    const parsed = readSurfaceMessage(`Before\n${message}\nAfter`);
    expect(parsed?.surface).toEqual(costSimulator);
    expect(parsed?.before).toContain("Before");
    expect(parsed?.after).toBe("After");
  });

  it("uses the same source identity while streaming and replaying canonical history", () => {
    const item = { type: "assistant_message" as const, text: message, messageId: "message-1" };
    const streaming = transformAssistant({ item, phase: "streaming" });
    const replay = transformAssistant({
      item: JSON.parse(JSON.stringify(item)),
      phase: "complete",
    });
    expect(streaming?.items[0].data).toMatchObject({
      sourceKey: "message-1",
      phase: "streaming",
      surface: costSimulator,
    });
    expect(replay?.items[0].data).toMatchObject({
      sourceKey: "message-1",
      phase: "complete",
      surface: costSimulator,
    });
    expect(streaming?.items[0].kind).toBe(replay?.items[0].kind);
    expect(
      transformAssistant({ item: { ...item, messageId: undefined }, phase: "complete" }),
    ).toBeUndefined();
    expect(
      transformAssistant({
        item: { ...item, text: `Download [file](/tmp/report.pdf)\n${message}` },
        phase: "complete",
      }),
    ).toBeUndefined();
  });

  it.each([
    "[Download report](/tmp/report.pdf)",
    "**Important**",
    "https://example.com",
    "1. First item",
    "---",
  ])("preserves formatted fallback %s in the original chat", (fallback) => {
    const surface = { ...costSimulator, fallback };
    expect(
      transformAssistant({
        item: {
          type: "assistant_message",
          text: surfaceText(surface),
          messageId: "markdown-fallback",
        },
        phase: "complete",
      }),
    ).toBeUndefined();
  });

  it("projects plain fallback text containing decimal amounts", () => {
    const surface = { ...costSimulator, fallback: "Estimated cost is $1.50 per month" };
    expect(
      transformAssistant({
        item: {
          type: "assistant_message",
          text: surfaceText(surface),
          messageId: "decimal-fallback",
        },
        phase: "complete",
      })?.items[0].data,
    ).toMatchObject({ surface });
  });

  it.each(["present_ui", "mcp__pandaos_ui__present_ui", "pandaos_ui.present_ui"])(
    "recognizes %s MCP output without trusting tool input",
    (name) => {
      const item = {
        type: "tool_call" as const,
        callId: "call-1",
        name,
        status: "completed" as const,
        error: null,
        detail: {
          type: "unknown" as const,
          input: { html: "unsafe" },
          output: { structuredContent: costSimulator, content: [{ type: "text", text: message }] },
        },
      };
      expect(transformTool({ item, phase: "complete" })?.items[0].data).toMatchObject({
        sourceKey: "call-1",
        surface: costSimulator,
      });
      expect(
        transformTool({ item: { ...item, status: "running" }, phase: "streaming" }),
      ).toBeUndefined();
      expect(
        transformTool({ item: { ...item, name: "unrelated" }, phase: "complete" }),
      ).toBeUndefined();
      expect(
        transformTool({
          item: {
            ...item,
            detail: { ...item.detail, output: { isError: true, structuredContent: costSimulator } },
          },
          phase: "complete",
        }),
      ).toBeUndefined();
      expect(
        transformTool({
          item: {
            ...item,
            detail: { ...item.detail, output: { content: [{ type: "text", text: message }] } },
          },
          phase: "complete",
        })?.items[0].data,
      ).toMatchObject({ surface: costSimulator });
      expect(
        transformTool({
          item: { ...item, detail: { ...item.detail, output: costSimulator } },
          phase: "complete",
        })?.items[0].data,
      ).toMatchObject({ surface: costSimulator });
      expect(
        transformTool({
          item: { ...item, detail: { ...item.detail, output: JSON.stringify(costSimulator) } },
          phase: "complete",
        })?.items[0].data,
      ).toMatchObject({ surface: costSimulator });
    },
  );
});

describe("saved inputs", () => {
  it("survives store restart, isolates sources and versions, rejects stale saves", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pandaos-ui-"));
    const key = { agentId: "agent-1", sourceKey: "source-1", surface: costSimulator };
    try {
      const store = new SurfaceStore(directory);
      expect(await store.read(key)).toEqual({ revision: 0, values: null });
      const values = { ...initialValues(costSimulator), requests: 20000 };
      await store.save(key, values, 0);
      expect(await new SurfaceStore(directory).read(key)).toEqual({ revision: 1, values });
      expect(await store.read({ ...key, sourceKey: "source-2" })).toEqual({
        revision: 0,
        values: null,
      });
      expect(await store.read({ ...key, surface: { ...costSimulator, revision: 2 } })).toEqual({
        revision: 0,
        values: null,
      });
      await expect(store.save(key, values, 0)).rejects.toThrow("another client");
      await expect(store.save(key, { ...values, requests: -1 }, 1)).rejects.toThrow("between");
      expect(await store.save(key, values, 1)).toEqual({ revision: 2, values });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reports storage failure without acknowledging a save", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pandaos-ui-"));
    try {
      const file = join(directory, "not-a-directory");
      await writeFile(file, "unchanged");
      const store = new SurfaceStore(file);
      await expect(
        store.save(
          { agentId: "a", sourceKey: "s", surface: costSimulator },
          initialValues(costSimulator),
          0,
        ),
      ).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("serializes simultaneous saves and keeps the first acknowledged version", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pandaos-ui-"));
    const key = { agentId: "agent", sourceKey: "message", surface: costSimulator };
    const first = { ...initialValues(costSimulator), requests: 20000 };
    const second = { ...initialValues(costSimulator), requests: 30000 };
    try {
      const store = new SurfaceStore(directory);
      const results = await Promise.allSettled([
        store.save(key, first, 0),
        store.save(key, second, 0),
      ]);
      expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
      expect(await store.read(key)).toEqual({ revision: 1, values: first });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects saved values that make a valid initial calculator divide by zero", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pandaos-ui-"));
    const surface = surfaceSchema.parse({
      ...costSimulator,
      calculations: [{ id: "total", operation: "ratio", values: [100, { ref: "requests" }] }],
      blocks: [{ type: "Metric", label: "Ratio", value: { ref: "total" }, format: "number" }],
    });
    const key = { agentId: "agent", sourceKey: "message", surface };
    try {
      const store = new SurfaceStore(directory);
      await expect(store.save(key, { ...initialValues(surface), requests: 0 }, 0)).rejects.toThrow(
        "division by zero",
      );
      expect(await store.read(key)).toEqual({ revision: 0, values: null });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
