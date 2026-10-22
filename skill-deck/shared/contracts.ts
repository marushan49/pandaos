import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const scopeSchema = z.enum(["global", "project"]);
export const sourceSchema = z.object({
  kind: z.enum(["git", "npm", "local", "unknown"]),
  label: z.string(),
  url: z.string().nullable(),
  revision: z.string().nullable(),
  filePath: z.string().optional(),
});
export const updateSchema = z.object({
  status: z.enum(["unchecked", "current", "available", "unknown", "error"]),
  checkedAt: z.string().nullable(),
  message: z.string(),
});
export const usageSchema = z.object({
  provider: z.string(),
  count: z.number().int().nonnegative(),
  lastUsedAt: z.string(),
});
export const skillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  scopes: z.array(scopeSchema),
  providers: z.array(z.string()),
  paths: z.array(z.string()),
  realPath: z.string().nullable(),
  contentHash: z.string().nullable(),
  health: z.enum(["ok", "broken", "unreadable"]),
  source: sourceSchema,
  update: updateSchema,
  usage: z.array(usageSchema),
});
export const findingSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "broken-link",
    "unreadable",
    "name-collision",
    "identical-content",
    "possible-overlap",
  ]),
  certainty: z.enum(["verified", "possible"]),
  title: z.string(),
  evidence: z.array(z.string()),
  skillIds: z.array(z.string()),
});
export const inventorySchema = z.object({
  scannedAt: z.string(),
  workspaceId: z.string().nullable(),
  projects: z.array(
    z.object({
      workspaceId: z.string(),
      projectId: z.string(),
      name: z.string(),
      directory: z.string(),
    }),
  ),
  skills: z.array(skillSchema),
  findings: z.array(findingSchema),
  warnings: z.array(z.string()),
  observation: z.object({ since: z.string(), active: z.boolean(), limitation: z.string() }),
});
const scopeInput = z.object({ workspaceId: z.string().min(1).optional() });
export const inventory = defineRpc({
  name: "skills.inventory",
  input: scopeInput,
  output: inventorySchema,
});
export const skillDetail = defineRpc({
  name: "skills.detail",
  input: scopeInput.extend({ id: z.string().min(1) }),
  output: z.object({
    skill: skillSchema,
    content: z.string().nullable(),
    truncated: z.boolean(),
    findings: z.array(findingSchema),
  }),
});
export const checkUpdates = defineRpc({
  name: "skills.check-updates",
  input: scopeInput,
  output: inventorySchema,
});
export type Skill = z.infer<typeof skillSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type Inventory = z.infer<typeof inventorySchema>;
