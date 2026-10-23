import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const BuildJobSchema = z.object({
  id: z.string(),
  sequence: z.number(),
  state: z.enum(["queued", "running", "finished"]),
  project: z.string(),
  task: z.string(),
  worker: z.string(),
  klass: z.string(),
  priority: z.string(),
  agent: z.string(),
  seconds: z.number().nullable(),
  waited: z.number().nullable(),
  exit: z.number().nullable(),
  reason: z.string().nullable(),
  placement: z.string().nullable(),
  memoryGib: z.number().nullable(),
  artifacts: z.array(z.string()),
  finishedAt: z.number().nullable(),
});

export const BuildWorkerSchema = z.object({
  name: z.string(),
  state: z.enum(["ready", "disabled", "offline"]),
  detail: z.string(),
});

export const buildStatusRpc = defineRpc({
  name: "build-scheduler.status",
  input: z.object({ recent: z.number().int().min(0).max(100).default(15) }),
  output: z.object({
    available: z.boolean(),
    error: z.string().nullable(),
    jobs: z.array(BuildJobSchema),
    workers: z.array(BuildWorkerSchema),
  }),
});

export type BuildJob = z.infer<typeof BuildJobSchema>;
export type BuildWorker = z.infer<typeof BuildWorkerSchema>;
export type BuildStatus = z.infer<(typeof buildStatusRpc)["output"]>;
