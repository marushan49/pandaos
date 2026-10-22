import { z } from "zod";

export const MAX_SURFACE_BYTES = 48 * 1024;
export function utf8Length(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}
const key = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
const label = z.string().trim().min(1).max(240);
const numeric = z.number().finite().min(-1e12).max(1e12);
const reference = z.union([numeric, z.object({ ref: key }).strict()]);
const input = z
  .object({
    id: key,
    label,
    kind: z.enum(["number", "slider"]),
    min: numeric,
    max: numeric,
    step: z.number().positive().max(1e12),
    value: numeric,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.min >= value.max ||
      value.value < value.min ||
      value.value > value.max ||
      value.step > value.max - value.min ||
      value.min + value.step === value.min ||
      value.max - value.step === value.max
    ) {
      ctx.addIssue({ code: "custom", message: "Invalid input range or initial value" });
    }
  });
const calculationSchema = z
  .object({
    id: key,
    operation: z.enum(["sum", "product", "difference", "ratio"]),
    values: z.array(reference).min(2).max(16),
  })
  .strict();
const valueFormat = z.enum(["number", "EUR", "USD", "percent"]);
const point = z.object({ label, value: reference }).strict();
export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Note"), text: z.string().min(1).max(4000) }).strict(),
  z.object({ type: z.literal("Metric"), label, value: reference, format: valueFormat }).strict(),
  z
    .object({
      type: z.literal("BarChart"),
      label,
      points: z.array(point).min(1).max(24),
      format: valueFormat,
    })
    .strict(),
  z
    .object({
      type: z.literal("Table"),
      label,
      columns: z.array(label).min(1).max(6),
      rows: z.array(z.array(z.union([z.string().max(400), reference])).max(6)).max(50),
    })
    .strict(),
]);

const surfaceShape = z
  .object({
    protocol: z.literal("pandaos.ui"),
    version: z.literal(1),
    id: key,
    revision: z.number().int().min(1).max(1e9),
    title: label,
    fallback: z.string().trim().min(1).max(8000),
    inputs: z.array(input).max(16),
    calculations: z.array(calculationSchema).max(32),
    blocks: z.array(blockSchema).min(1).max(32),
    actions: z.array(z.enum(["reset", "save"])).max(2),
  })
  .strict();

export const surfaceSchema = surfaceShape.superRefine((surface, ctx) => {
  const known = new Set<string>();
  const check = (value: z.output<typeof reference>) => {
    if (typeof value !== "number" && !known.has(value.ref)) {
      ctx.addIssue({ code: "custom", message: `Unknown or forward reference: ${value.ref}` });
    }
  };
  for (const field of [...surface.inputs, ...surface.calculations]) {
    if (known.has(field.id)) ctx.addIssue({ code: "custom", message: `Duplicate id: ${field.id}` });
    if ("values" in field) field.values.forEach(check);
    known.add(field.id);
  }
  for (const block of surface.blocks) {
    if (block.type === "Metric") check(block.value);
    if (block.type === "BarChart") block.points.forEach((p) => check(p.value));
    if (block.type === "Table") {
      for (const row of block.rows) {
        if (row.length !== block.columns.length)
          ctx.addIssue({ code: "custom", message: "Table row width differs from columns" });
        row.forEach((cell) => {
          if (typeof cell !== "string") check(cell);
        });
      }
    }
  }
  if (new Set(surface.actions).size !== surface.actions.length)
    ctx.addIssue({ code: "custom", message: "Duplicate action" });
  if (utf8Length(JSON.stringify(surface)) > MAX_SURFACE_BYTES)
    ctx.addIssue({ code: "custom", message: "Surface exceeds 48 KiB" });
  if (ctx.issues.length === 0) {
    try {
      calculate(surface, initialValues(surface));
    } catch {
      ctx.addIssue({ code: "custom", message: "Initial calculations must have finite results" });
    }
  }
});

export type Surface = z.output<typeof surfaceShape>;
export type ValueReference = z.output<typeof reference>;
export type SurfaceBlock = z.output<typeof blockSchema>;
export type Values = Record<string, number>;

export function parseSurface(text: string): Surface {
  if (text.length > MAX_SURFACE_BYTES || utf8Length(text) > MAX_SURFACE_BYTES)
    throw new Error("Surface exceeds 48 KiB");
  return surfaceSchema.parse(JSON.parse(text));
}

export function initialValues(surface: Surface): Values {
  return Object.fromEntries(surface.inputs.map((field) => [field.id, field.value]));
}

export function parseNumericInput(text: string): number {
  const normalized = text.trim().replace(",", ".");
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)
    ? Number(normalized)
    : NaN;
}

export function validateValues(surface: Surface, values: Values): Values {
  if (Object.keys(values).length !== surface.inputs.length)
    throw new Error("Input set has changed");
  for (const field of surface.inputs) {
    const value = values[field.id];
    if (!Number.isFinite(value) || value < field.min || value > field.max)
      throw new Error(`Enter ${field.label} between ${field.min} and ${field.max}`);
  }
  return values;
}

export function resolveValue(value: ValueReference, values: Values): number {
  const result = typeof value === "number" ? value : values[value.ref];
  if (!Number.isFinite(result)) throw new Error("A calculation has no finite result");
  return result;
}

export function calculate(surface: Surface, values: Values): Values {
  const result = { ...validateValues(surface, values) };
  for (const calculation of surface.calculations) {
    const numbers = calculation.values.map((value) => resolveValue(value, result));
    const [first = 0, ...rest] = numbers;
    let value: number;
    switch (calculation.operation) {
      case "sum":
        value = numbers.reduce((a, b) => a + b, 0);
        break;
      case "product":
        value = numbers.reduce((a, b) => a * b, 1);
        break;
      case "difference":
        value = rest.reduce((a, b) => a - b, first);
        break;
      case "ratio":
        value = rest.reduce((a, b) => a / b, first);
        break;
    }
    if (!Number.isFinite(value))
      throw new Error(`Cannot calculate ${calculation.id}: division by zero or overflow`);
    result[calculation.id] = value;
  }
  return result;
}

export function formatValue(
  value: number,
  format: z.output<typeof valueFormat> = "number",
): string {
  return new Intl.NumberFormat(
    "en-US",
    format === "EUR" || format === "USD"
      ? { style: "currency", currency: format }
      : { style: format === "percent" ? "percent" : "decimal", maximumFractionDigits: 2 },
  ).format(value);
}

export function surfaceText(surface: Surface): string {
  return `${surface.fallback}\n\n\`\`\`pandaos-ui\n${JSON.stringify(surface)}\n\`\`\``;
}
