import type { PluginTimelineTransformerContribution } from "@getpaseo/plugin/client";
import { z } from "zod";
import { MAX_SURFACE_BYTES, parseSurface, surfaceSchema } from "../shared/surface";

export const timelineDataSchema = z
  .object({
    surface: surfaceSchema,
    sourceKey: z.string().min(1).max(512),
    before: z.string().max(100000),
    after: z.string().max(100000),
    phase: z.enum(["streaming", "complete"]),
  })
  .strict();

export function readSurfaceMessage(text: string) {
  if (text.length > 100000) return;
  const match = /(?:^|\n)```pandaos-ui\r?\n([\s\S]*?)\r?\n```(?=\r?\n|$)/.exec(text);
  if (!match || text.indexOf("```pandaos-ui", match.index + match[0].length) >= 0) return;
  try {
    return {
      surface: parseSurface(match[1]),
      before: text.slice(0, match.index).trim(),
      after: text.slice(match.index + match[0].length).trim(),
    };
  } catch {
    return;
  }
}

function replacement(data: z.output<typeof timelineDataSchema>) {
  return { items: [{ type: "plugin" as const, kind: "interactive-surface", version: 1, data }] };
}

export const transformAssistant: PluginTimelineTransformerContribution<"assistant_message">["transform"] =
  ({ item, phase }) => {
    const parsed = readSurfaceMessage(item.text);
    if (
      !parsed ||
      !item.messageId ||
      parsed.after !== "" ||
      (parsed.before !== "" &&
        (parsed.before !== parsed.surface.fallback ||
          !/^[\p{L}\p{N}]/u.test(parsed.before) ||
          /[\\`*_#[\]<>~|\r\n]|:\/\/|[\p{L}\p{N}]\.\p{L}|^\d+[.)]\s/u.test(parsed.before)))
    )
      return;
    return replacement({ ...parsed, before: "", phase, sourceKey: item.messageId });
  };

const toolResultSchema = z.object({
  structuredContent: z.unknown().optional(),
  content: z
    .array(z.object({ type: z.string(), text: z.string().max(100000).optional() }).passthrough())
    .max(16)
    .optional(),
  isError: z.boolean().optional(),
});

function readToolText(text: string) {
  const message = readSurfaceMessage(text);
  if (message) return message;
  try {
    return { surface: parseSurface(text), before: "", after: "" };
  } catch {
    return;
  }
}

export const transformTool: PluginTimelineTransformerContribution<"tool_call">["transform"] = ({
  item,
  phase,
}) => {
  if (
    !/(?:^|[_.])present_ui$/.test(item.name) ||
    item.status !== "completed" ||
    item.detail.type !== "unknown"
  )
    return;
  const output = item.detail.output;
  if (typeof output === "string") {
    const parsed = readToolText(output);
    return parsed ? replacement({ ...parsed, phase, sourceKey: item.callId }) : undefined;
  }
  const direct = surfaceSchema.safeParse(output);
  if (direct.success)
    return replacement({
      surface: direct.data,
      before: "",
      after: "",
      phase,
      sourceKey: item.callId,
    });
  const result = toolResultSchema.safeParse(output);
  if (!result.success || result.data.isError) return;
  const structured = surfaceSchema.safeParse(result.data.structuredContent);
  if (structured.success)
    return replacement({
      surface: structured.data,
      before: "",
      after: "",
      phase,
      sourceKey: item.callId,
    });
  const text =
    result.data.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n") ?? "";
  if (text.length > MAX_SURFACE_BYTES * 2) return;
  const parsed = readToolText(text);
  return parsed ? replacement({ ...parsed, phase, sourceKey: item.callId }) : undefined;
};
