import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const pluginSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  path: z.string(),
  status: z.string(),
  enabled: z.boolean(),
  source: z.string(),
  revision: z.string().nullable(),
  update: z.enum(["unchecked", "update", "current", "installed-newer", "local", "error"]),
  message: z.string(),
});
export const pluginInventorySchema = z.object({
  scannedAt: z.string(),
  plugins: z.array(pluginSchema),
});
export const listPlugins = defineRpc({
  name: "plugins.inventory",
  input: z.object({ checkUpdates: z.boolean().default(false) }),
  output: pluginInventorySchema,
});
export type DeckPlugin = z.infer<typeof pluginSchema>;
