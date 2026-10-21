import { defineSettings, settingsRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const pinSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  text: z.string(),
  url: z.string().optional(),
  createdAt: z.number(),
});

export type Pin = z.infer<typeof pinSchema>;

export const pinsDocumentSchema = z.object({ pins: z.array(pinSchema).default([]) });

export type PinsDocument = z.infer<typeof pinsDocumentSchema>;

export const pinsSettings = defineSettings({
  id: "pins",
  scope: "host",
  version: 2,
  schema: pinsDocumentSchema,
  migrate: () => ({ pins: [] }),
});

export const pinsRpc = settingsRpc(pinsSettings.id);

export function makePin(workspaceId: string, input: string): Pin | null {
  const text = input.trim();
  if (!text) return null;
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const pin: Pin = { id, workspaceId, text, createdAt: Date.now() };
  return /^https?:\/\/\S+$/i.test(text) ? { ...pin, url: text } : pin;
}
