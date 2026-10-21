import { z } from "zod";

const articleSchema = z.object({
  url: z.string().refine((url) => /^https?:\/\//i.test(url)),
  title: z.string(),
  seendate: z.string(),
  domain: z.string(),
});
export interface Article {
  url: string;
  title: string;
  publishedAt: string;
  domain: string;
  source: "gdelt" | "finnhub";
}

export function timeoutSignal(ms: number) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms).unref?.();
  return controller.signal;
}

export class RateLimited extends Error {}

export function gdeltDate(value: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!match) return new Date().toISOString();
  const [, y, m, d, h, min, s] = match;
  return new Date(Date.UTC(+y, +m - 1, +d, +h, +min, +s)).toISOString();
}

export function gdeltQuery(keywords: readonly string[]): string {
  const terms = keywords.map((word) => (/\s/.test(word) ? `"${word}"` : word));
  return terms.length > 1 ? `(${terms.join(" OR ")})` : (terms[0] ?? "");
}

export async function fetchGdelt(query: string, timespan = "24h"): Promise<Article[]> {
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.search = new URLSearchParams({
    query,
    timespan,
    mode: "ArtList",
    format: "json",
    maxrecords: "50",
    sort: "DateDesc",
  }).toString();
  const response = await fetch(url, {
    signal: timeoutSignal(30_000),
    headers: { Accept: "application/json" },
  });
  const text = await response.text();
  if (response.status === 429) throw new RateLimited("GDELT begrenzt die Anfragen (HTTP 429).");
  if (!response.ok) throw new Error(`GDELT antwortet mit HTTP ${response.status}.`);
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    if (/no articles|no results/i.test(text)) return [];
    throw new Error(`GDELT hat die Suche abgelehnt: ${text.replace(/<[^>]*>/g, "").slice(0, 200)}`);
  }
  const parsed = z.object({ articles: z.array(articleSchema).default([]) }).parse(payload);
  return parsed.articles.map((article) => ({
    url: article.url,
    title: article.title,
    domain: article.domain,
    publishedAt: gdeltDate(article.seendate),
    source: "gdelt" as const,
  }));
}

export function createGdeltQueue({
  fetcher = fetchGdelt,
  spacingMs = 6000,
  backoffMs = [30_000, 60_000],
  sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
}: {
  fetcher?: typeof fetchGdelt;
  spacingMs?: number;
  backoffMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
} = {}) {
  let tail: Promise<unknown> = Promise.resolve();
  let nextAt = 0;
  async function run(query: string, timespan?: string): Promise<Article[]> {
    for (let attempt = 0; ; attempt += 1) {
      const wait = nextAt - now();
      if (wait > 0) await sleep(wait);
      nextAt = now() + spacingMs;
      try {
        return await fetcher(query, timespan);
      } catch (error) {
        if (!(error instanceof RateLimited)) throw error;
        const delay = backoffMs[attempt];
        if (delay === undefined)
          throw new RateLimited(
            "GDELT blockt weiter (HTTP 429), auch nach 30 und 60 Sekunden Pause. Nächster Versuch im nächsten Durchlauf.",
          );
        nextAt = now() + delay;
      }
    }
  }
  return (query: string, timespan?: string): Promise<Article[]> => {
    const result = tail.then(() => run(query, timespan));
    tail = result.catch(() => undefined);
    return result;
  };
}
