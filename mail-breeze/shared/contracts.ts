import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const PersonSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().max(240),
});
export const PreferencesSchema = z.object({
  clientId: z.string().trim().max(100).default(""),
  tenant: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9.-]+$/)
    .default("common"),
  projectDirectory: z.string().trim().max(1000).default(""),
  people: z.array(PersonSchema).max(100).default([]),
  context: z.string().max(12000).default(""),
  importance: z.string().max(4000).default(""),
});
export const MailSchema = z.object({
  source: z.enum(["outlook", "gmail", "manual"]).optional(),
  id: z.string().min(1).max(500),
  conversationId: z.string().min(1).max(500),
  subject: z.string().trim().min(1).max(1000),
  sender: z.string().max(200),
  senderEmail: z.string().max(320),
  body: z.string().min(1).max(40000),
  receivedAt: z.iso.datetime(),
  webLink: z.url().optional(),
  bulk: z.boolean().optional(),
});
export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  mail: MailSchema,
  messageIds: z.array(z.string()),
  status: z.enum(["ready", "working", "done", "needs_input", "failed", "dismissed"]),
  agentId: z.string().optional(),
  result: z.string().default(""),
  todos: z.array(z.string()).default([]),
  error: z.string().optional(),
  updatedAt: z.string(),
  demo: z.boolean().default(false),
});
export const NoticeSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  text: z.string(),
  createdAt: z.string(),
});
export const BreezeStateSchema = z.object({
  preferences: PreferencesSchema,
  connection: z.object({
    provider: z.enum(["outlook", "gmail"]).optional(),
    status: z.enum(["disconnected", "connecting", "connected", "error"]),
    account: z.string().optional(),
    error: z.string().optional(),
    lastSyncAt: z.string().optional(),
    reader: z
      .object({
        agentId: z.string().optional(),
        status: z.enum(["idle", "reading", "error"]),
        nextReadAt: z.string().optional(),
        query: z.string(),
      })
      .optional(),
  }),
  tasks: z.array(TaskSchema),
  notices: z.array(NoticeSchema),
});
export type Preferences = z.infer<typeof PreferencesSchema>;
export type Mail = z.infer<typeof MailSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type BreezeState = z.infer<typeof BreezeStateSchema>;

export const getState = defineRpc({
  name: "breeze.state",
  input: z.object({}),
  output: BreezeStateSchema,
});
export const savePreferences = defineRpc({
  name: "breeze.preferences.save",
  input: PreferencesSchema,
  output: BreezeStateSchema,
});
export const importMail = defineRpc({
  name: "breeze.mail.import",
  input: MailSchema,
  output: BreezeStateSchema,
});
export const loadDemo = defineRpc({
  name: "breeze.demo.load",
  input: z.object({}),
  output: BreezeStateSchema,
});
export const clearDemo = defineRpc({
  name: "breeze.demo.clear",
  input: z.object({}),
  output: BreezeStateSchema,
});
export const startTask = defineRpc({
  name: "breeze.task.start",
  input: z.object({ taskId: z.string() }),
  output: BreezeStateSchema,
});
export const dismissTask = defineRpc({
  name: "breeze.task.dismiss",
  input: z.object({ taskId: z.string() }),
  output: BreezeStateSchema,
});
export const syncMail = defineRpc({
  name: "breeze.mail.sync",
  input: z.object({}),
  output: BreezeStateSchema,
});
export const beginLogin = defineRpc({
  name: "breeze.login.begin",
  input: z.object({}),
  output: z.object({ userCode: z.string(), verificationUri: z.url(), expiresAt: z.string() }),
});
export const connectGmail = defineRpc({
  name: "breeze.gmail.connect",
  input: z.object({
    account: z.email(),
    query: z.string().trim().min(1).max(1000),
  }),
  output: BreezeStateSchema,
});
export const disconnect = defineRpc({
  name: "breeze.login.disconnect",
  input: z.object({}),
  output: BreezeStateSchema,
});
