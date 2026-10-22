import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { surfaceSchema } from "./surface";

export const valuesSchema = z
  .record(z.string().regex(/^[a-z][a-z0-9-]{0,47}$/), z.number().finite())
  .refine((values) => Object.keys(values).length <= 16);
export const stateKeySchema = z
  .object({
    agentId: z.string().min(1).max(128),
    sourceKey: z.string().min(1).max(512),
    surface: surfaceSchema,
  })
  .strict();
export const savedStateSchema = z
  .object({ revision: z.number().int().min(0), values: valuesSchema.nullable() })
  .strict();
export const readState = defineRpc({
  name: "ui.state.read",
  input: stateKeySchema,
  output: savedStateSchema,
});
export const saveState = defineRpc({
  name: "ui.state.save",
  input: stateKeySchema.extend({ values: valuesSchema, expectedRevision: z.number().int().min(0) }),
  output: savedStateSchema,
});
