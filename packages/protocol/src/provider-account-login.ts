import { z } from "zod";

export const ClaudeAccountLoginOperationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("start"),
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(1000),
    sharedTeam: z.boolean(),
  }),
  z.object({ kind: z.literal("status"), loginId: z.string().uuid() }),
  z.object({
    kind: z.literal("code"),
    loginId: z.string().uuid(),
    code: z
      .string()
      .trim()
      .min(1)
      .max(4096)
      .regex(/^[^\r\n]+$/),
  }),
  z.object({ kind: z.literal("cancel"), loginId: z.string().uuid() }),
]);

export const ClaudeAccountLoginStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("starting") }),
  z.object({ status: z.literal("waiting"), url: z.string().url() }),
  z.object({ status: z.literal("complete"), provider: z.string() }),
  z.object({ status: z.literal("error"), message: z.string() }),
  z.object({ status: z.literal("cancelled") }),
]);

export const ClaudeAccountLoginRequestSchema = z.object({
  type: z.literal("provider.claude.login.request"),
  operation: ClaudeAccountLoginOperationSchema,
  requestId: z.string(),
});

export const ClaudeAccountLoginResponseSchema = z.object({
  type: z.literal("provider.claude.login.response"),
  payload: z.object({
    requestId: z.string(),
    loginId: z.string().nullable(),
    state: ClaudeAccountLoginStateSchema,
  }),
});

export type ClaudeAccountLoginOperation = z.infer<typeof ClaudeAccountLoginOperationSchema>;
export type ClaudeAccountLoginState = z.infer<typeof ClaudeAccountLoginStateSchema>;
