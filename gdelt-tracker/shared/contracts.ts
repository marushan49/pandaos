import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { alertSchema, entryDraft, feedSchema, importedPosition, watchlistSchema } from "./model.ts";

export const readState = defineRpc({
  name: "state.read",
  input: z.object({}),
  output: z.object({
    watchlist: watchlistSchema,
    alerts: z.array(alertSchema),
    quotes: feedSchema.shape.quotes,
    status: feedSchema.shape.status,
    polledAt: feedSchema.shape.polledAt,
    config: z.object({
      finnhub: z.boolean(),
      telegram: z.boolean(),
      model: z.boolean(),
    }),
  }),
});
export const saveEntry = defineRpc({
  name: "entry.save",
  input: z.object({
    revision: z.number().int(),
    id: z.string().uuid().optional(),
    entry: entryDraft,
  }),
  output: watchlistSchema,
});
export const saveEntries = defineRpc({
  name: "entry.save_many",
  input: z.object({ revision: z.number().int(), entries: z.array(entryDraft).min(1).max(40) }),
  output: watchlistSchema,
});
export const removeEntry = defineRpc({
  name: "entry.remove",
  input: z.object({ revision: z.number().int(), id: z.string().uuid() }),
  output: watchlistSchema,
});
export const readScreenshot = defineRpc({
  name: "import.read_screenshot",
  input: z.object({
    images: z
      .array(
        z.object({
          base64: z.string().min(1).max(14_000_000),
          mimeType: z.string().regex(/^image\//),
        }),
      )
      .min(1)
      .max(4),
  }),
  output: z.object({ positions: z.array(importedPosition) }),
});
export const askAlert = defineRpc({
  name: "alert.ask",
  input: z.object({ id: z.string(), question: z.string().trim().min(2).max(2000) }),
  output: alertSchema,
});
export const saveConfig = defineRpc({
  name: "config.save",
  input: z.object({
    finnhubKey: z.string().trim().max(200).optional(),
    telegramToken: z.string().trim().max(200).optional(),
    telegramChatId: z.string().trim().max(40).optional(),
  }),
  output: z.object({ finnhub: z.boolean(), telegram: z.boolean(), model: z.boolean() }),
});
export const testTelegram = defineRpc({
  name: "telegram.test",
  input: z.object({}),
  output: z.object({ ok: z.literal(true) }),
});
export const pollNow = defineRpc({
  name: "poll.run",
  input: z.object({}),
  output: z.object({ started: z.boolean() }),
});
