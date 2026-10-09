import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const RecoveryRecordSchema = z.object({
  agentId: z.string(),
  workspaceId: z.string().nullable(),
  title: z.string().nullable(),
  provider: z.string(),
  cwd: z.string(),
  revision: z.string(),
  epoch: z.string(),
  phase: z.enum(["accepted", "running", "interrupted", "resuming", "resolved"]),
  turnId: z.string().nullable(),
  messageId: z.string().nullable(),
  resumeMessageId: z.string().nullable(),
  startedAt: z.string(),
  updatedAt: z.string(),
  reason: z.string(),
});
export type RecoveryRecord = z.infer<typeof RecoveryRecordSchema>;

export const RecoveryCandidateSchema = RecoveryRecordSchema.extend({
  canResume: z.boolean(),
  blockedReason: z.string().nullable(),
});
export type RecoveryCandidate = z.infer<typeof RecoveryCandidateSchema>;

export const listRecovery = defineRpc({
  name: "session-recovery.list",
  input: z.object({}),
  output: z.object({
    candidates: z.array(RecoveryCandidateSchema),
    tracked: z.number().int().nonnegative(),
    checkedAt: z.string(),
  }),
});

const Selection = z.object({ agentId: z.string().min(1), revision: z.string().min(1) });

export const resumeRecovery = defineRpc({
  name: "session-recovery.resume",
  input: Selection,
  output: z.object({ accepted: z.boolean(), messageId: z.string() }),
});

export const dismissRecovery = defineRpc({
  name: "session-recovery.dismiss",
  input: Selection,
  output: z.object({ dismissed: z.boolean() }),
});
