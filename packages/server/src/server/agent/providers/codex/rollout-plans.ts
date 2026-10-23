import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { z } from "zod";

const UPDATE_PLAN_CALL = "tools.update_plan(";

const PlanArgumentsSchema = z
  .object({
    plan: z.array(
      z.object({ step: z.string(), status: z.string().nullable().optional() }).passthrough(),
    ),
  })
  .passthrough();

export interface CodexRolloutPlan {
  turnId: string | null;
  timestamp?: string;
  steps: Array<{ step: string; status?: string | null }>;
}

export async function readCodexRolloutPlans(rolloutPath: string): Promise<CodexRolloutPlan[]> {
  const reader = new RolloutPlanReader();
  try {
    const lines = createInterface({
      input: createReadStream(rolloutPath, { encoding: "utf8" }),
      crlfDelay: Number.POSITIVE_INFINITY,
    });
    for await (const line of lines) reader.accept(line);
  } catch {
    return [];
  }
  return reader.plans;
}

export function parseCodexRolloutPlans(content: string): CodexRolloutPlan[] {
  const reader = new RolloutPlanReader();
  for (const line of content.split("\n")) reader.accept(line);
  return reader.plans;
}

class RolloutPlanReader {
  public readonly plans: CodexRolloutPlan[] = [];
  private turnId: string | null = null;

  public accept(line: string): void {
    if (!line.includes("turn_id") && !line.includes("update_plan")) return;
    const record = parseRecord(line);
    const payload = asRecord(record?.payload);
    if (!record || !payload) return;
    if (record.type === "turn_context" || payload.type === "task_started") {
      if (typeof payload.turn_id === "string") this.turnId = payload.turn_id;
      return;
    }
    if (record.type !== "response_item") return;
    const timestamp = typeof record.timestamp === "string" ? record.timestamp : undefined;
    for (const argument of planArguments(payload)) {
      const parsed = PlanArgumentsSchema.safeParse(argument);
      if (!parsed.success) continue;
      this.plans.push({
        turnId: this.turnId,
        ...(timestamp ? { timestamp } : {}),
        steps: parsed.data.plan,
      });
    }
  }
}

function planArguments(payload: Record<string, unknown>): unknown[] {
  if (payload.type === "function_call" && payload.name === "update_plan") {
    return typeof payload.arguments === "string" ? [parseJson(payload.arguments)] : [];
  }
  if (payload.type === "custom_tool_call" && typeof payload.input === "string") {
    return extractUpdatePlanArguments(payload.input);
  }
  return [];
}

export function extractUpdatePlanArguments(source: string): unknown[] {
  const results: unknown[] = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf(UPDATE_PLAN_CALL, from);
    if (start < 0) return results;
    const open = start + UPDATE_PLAN_CALL.length - 1;
    const close = findClosingParen(source, open);
    if (close < 0) {
      from = open + 1;
      continue;
    }
    const json = jsLiteralToJson(source.slice(open + 1, close));
    if (json !== null) {
      const value = parseJson(json);
      if (value !== undefined) results.push(value);
    }
    from = close + 1;
  }
}

function findClosingParen(source: string, open: number): number {
  let depth = 0;
  let index = open;
  while (index < source.length) {
    const char = source[index];
    if (char === '"' || char === "'" || char === "`") {
      const string = readString(source, index);
      if (!string) return -1;
      index = string.next;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth += 1;
    if (char === ")" || char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) return char === ")" ? index : -1;
    }
    index += 1;
  }
  return -1;
}

function jsLiteralToJson(text: string): string | null {
  let out = "";
  let index = 0;
  while (index < text.length) {
    const char = text.charAt(index);
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      const string = readString(text, index);
      if (!string) return null;
      out += JSON.stringify(string.value);
      index = string.next;
      continue;
    }
    if ("{}[]:,".includes(char)) {
      if ((char === "}" || char === "]") && out.endsWith(",")) out = out.slice(0, -1);
      out += char;
      index += 1;
      continue;
    }
    const rest = text.slice(index);
    const identifier = /^[A-Za-z_$][\w$]*/.exec(rest)?.[0];
    if (identifier) {
      index += identifier.length;
      if (text.slice(index).trimStart().startsWith(":")) out += JSON.stringify(identifier);
      else if (identifier === "true" || identifier === "false" || identifier === "null") {
        out += identifier;
      } else return null;
      continue;
    }
    const number = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest)?.[0];
    if (!number) return null;
    out += number;
    index += number.length;
  }
  return out;
}

const SIMPLE_ESCAPES: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
  v: "\v",
  "0": "\0",
};

function readString(source: string, start: number): { value: string; next: number } | null {
  const quote = source[start];
  let value = "";
  let index = start + 1;
  while (index < source.length) {
    const char = source.charAt(index);
    if (char === quote) return { value, next: index + 1 };
    if (quote === "`" && char === "$" && source[index + 1] === "{") return null;
    if (char !== "\\") {
      if (char === "\n" && quote !== "`") return null;
      value += char;
      index += 1;
      continue;
    }
    const escaped = source.charAt(index + 1);
    if (escaped === "u" || escaped === "x") {
      const code = /^u\{([0-9a-fA-F]+)\}|^u([0-9a-fA-F]{4})|^x([0-9a-fA-F]{2})/.exec(
        source.slice(index + 1),
      );
      if (!code) return null;
      value += String.fromCodePoint(Number.parseInt(code[1] ?? code[2] ?? code[3] ?? "", 16));
      index += 1 + code[0].length;
      continue;
    }
    if (escaped === "\n") {
      index += 2;
      continue;
    }
    value += SIMPLE_ESCAPES[escaped] ?? escaped;
    index += 2;
  }
  return null;
}

function parseRecord(line: string): Record<string, unknown> | null {
  return asRecord(parseJson(line));
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
