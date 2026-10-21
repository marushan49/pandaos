import { z } from "zod";

export const kindLabels = {
  holding: "Eigene Position",
  watch: "Beobachten",
  topic: "Thema",
};
export const instrumentLabels = { stock: "Aktie", fund: "ETF/ETP" };
export const directionLabels = { positive: "Positiv", negative: "Negativ", neutral: "Neutral" };
export const strengthLabels = { low: "Niedrig", medium: "Mittel", high: "Hoch" };
export const pricedLabels = { yes: "Ja", partly: "Teilweise", no: "Nein", unknown: "Unbekannt" };

export const entryDraft = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(["holding", "watch", "topic"]),
  instrument: z.enum(["stock", "fund"]).default("stock"),
  ticker: z
    .string()
    .trim()
    .max(12)
    .regex(/^[A-Za-z0-9.-]*$/)
    .transform((value) => value.toUpperCase())
    .default(""),
  leverage: z.number().min(-25).max(25).default(1),
  keywords: z.array(z.string().trim().min(2).max(60)).min(1).max(12),
});
export const entrySchema = entryDraft.extend({ id: z.string().uuid() });
export const watchlistSchema = z.object({
  revision: z.number().int().nonnegative(),
  entries: z.array(entrySchema).max(100),
});

export const directionSchema = z.enum(["positive", "negative", "neutral"]);
export const strengthSchema = z.enum(["low", "medium", "high"]);
export const pricedSchema = z.enum(["yes", "partly", "no", "unknown"]);
export const chatSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  at: z.string(),
});
export const quoteSchema = z.object({
  price: z.number(),
  changePercent: z.number(),
  at: z.string(),
});
export const alertSchema = z.object({
  id: z.string(),
  storyKey: z.string(),
  entryId: z.string(),
  source: z.enum(["gdelt", "finnhub"]),
  title: z.string(),
  url: z.string(),
  domain: z.string(),
  publishedAt: z.string(),
  receivedAt: z.string(),
  direction: directionSchema,
  strength: strengthSchema,
  summary: z.string(),
  reasoning: z.string(),
  priced: pricedSchema,
  priceAtReceipt: quoteSchema.optional(),
  priceLatest: quoteSchema.optional(),
  notified: z.boolean().default(false),
  chat: z.array(chatSchema).default([]),
});
export const feedSchema = z.object({
  alerts: z.array(alertSchema),
  seen: z.array(z.string()),
  polledAt: z.record(z.string(), z.string()),
  quotes: z.record(z.string(), quoteSchema),
  status: z.object({
    gdelt: z.string().default(""),
    finnhub: z.string().default(""),
    model: z.string().default(""),
    telegram: z.string().default(""),
    lastRun: z.string().default(""),
  }),
});
export const configSchema = z.object({
  finnhubKey: z.string().default(""),
  telegramToken: z.string().default(""),
  telegramChatId: z.string().default(""),
});
export const importedPosition = z.object({
  name: z.string(),
  instrument: z.enum(["stock", "fund"]),
  ticker: z.string(),
  leverage: z.number(),
  keywords: z.array(z.string()),
});

export type Entry = z.infer<typeof entrySchema>;
export type EntryDraft = z.input<typeof entryDraft>;
export type Watchlist = z.infer<typeof watchlistSchema>;
export type Alert = z.infer<typeof alertSchema>;
export type Feed = z.infer<typeof feedSchema>;
export type Config = z.infer<typeof configSchema>;
export type Quote = z.infer<typeof quoteSchema>;
export type ImportedPosition = z.infer<typeof importedPosition>;
