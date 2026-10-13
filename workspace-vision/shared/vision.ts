import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const visionProgressSchema = z.object({
  open: z.number(),
  done: z.number(),
  blocked: z.string().nullable(),
  runsLastHour: z.number(),
});

export const visionGet = defineRpc({
  name: "vision.get",
  input: z.object({ cwd: z.string() }),
  output: z.object({
    projectGoal: z.string(),
    workspaceText: z.string(),
    workspaceFilePath: z.string(),
    progress: visionProgressSchema,
  }),
});

export const visionSave = defineRpc({
  name: "vision.save",
  input: z.object({
    cwd: z.string(),
    projectGoal: z.string(),
    workspaceText: z.string(),
  }),
  output: z.object({ saved: z.literal(true) }),
});
