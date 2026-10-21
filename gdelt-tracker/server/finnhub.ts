import { z } from "zod";
import { timeoutSignal, type Article } from "./gdelt.ts";
import type { Quote } from "../shared/model.ts";

async function call(path: string, params: Record<string, string>, key: string): Promise<unknown> {
  const url = new URL(`https://finnhub.io/api/v1/${path}`);
  url.search = new URLSearchParams(params).toString();
  const response = await fetch(url, {
    signal: timeoutSignal(20_000),
    headers: { "X-Finnhub-Token": key, Accept: "application/json" },
  });
  if (response.status === 401 || response.status === 403)
    throw new Error("Finnhub lehnt den API-Key ab oder der Tarif deckt den Abruf nicht ab.");
  if (response.status === 429) throw new Error("Finnhub-Limit erreicht (HTTP 429).");
  if (!response.ok) throw new Error(`Finnhub antwortet mit HTTP ${response.status}.`);
  return response.json();
}

function day(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function companyNews(symbol: string, key: string, now = new Date()) {
  const from = new Date(now.getTime() - 2 * 86_400_000);
  const items = z
    .array(
      z.object({
        datetime: z.number(),
        headline: z.string(),
        source: z.string(),
        url: z.string(),
      }),
    )
    .parse(await call("company-news", { symbol, from: day(from), to: day(now) }, key));
  return items
    .filter((item) => /^https?:\/\//.test(item.url) && item.headline)
    .map(
      (item): Article => ({
        url: item.url,
        title: item.headline,
        domain: item.source,
        publishedAt: new Date(item.datetime * 1000).toISOString(),
        source: "finnhub",
      }),
    );
}

export async function quote(symbol: string, key: string): Promise<Quote | undefined> {
  const data = z
    .object({ c: z.number(), dp: z.number().nullable(), t: z.number() })
    .parse(await call("quote", { symbol }, key));
  if (!data.c || !data.t) return undefined;
  return {
    price: data.c,
    changePercent: data.dp ?? 0,
    at: new Date(data.t * 1000).toISOString(),
  };
}
