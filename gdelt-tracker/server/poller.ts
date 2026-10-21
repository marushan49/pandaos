import { randomUUID } from "node:crypto";
import type { Alert, Entry, Feed, Quote } from "../shared/model.ts";
import { assess, type Generate } from "./assess.ts";
import { companyNews, quote } from "./finnhub.ts";
import { gdeltQuery, type Article } from "./gdelt.ts";
import type { Stores } from "./store.ts";
import { alertText, sendTelegram } from "./telegram.ts";

const pollEveryMs = 15 * 60_000;
const maxAssessmentsPerRun = 20;
const maxAgeMs = 48 * 3_600_000;

function tokens(title: string) {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N} ]+/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2),
  );
}

export function sameStory(a: string, b: string) {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return false;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.min(left.size, right.size) >= 0.6;
}

interface Candidate {
  entry: Entry;
  article: Article;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function createPoller({
  stores,
  gdelt,
  generate,
  now = () => new Date(),
}: {
  stores: Stores;
  gdelt: (query: string, timespan?: string) => Promise<Article[]>;
  generate?: Generate;
  now?: () => Date;
}) {
  let running: Promise<void> | null = null;

  async function readQuotes(entries: Entry[], key: string, status: Partial<Feed["status"]>) {
    const quotes: Record<string, Quote> = {};
    if (!key) return quotes;
    try {
      for (const ticker of new Set(entries.map((entry) => entry.ticker).filter(Boolean))) {
        const value = await quote(ticker, key);
        if (value) quotes[ticker] = value;
      }
      status.finnhub = "";
    } catch (error) {
      status.finnhub = message(error);
    }
    return quotes;
  }

  async function articlesFor(entry: Entry, key: string, status: Partial<Feed["status"]>) {
    const articles: Article[] = [];
    try {
      articles.push(...(await gdelt(gdeltQuery(entry.keywords), "24h")));
      status.gdelt = "";
    } catch (error) {
      status.gdelt = message(error);
    }
    if (!key || entry.instrument !== "stock" || !entry.ticker) return articles;
    try {
      articles.push(...(await companyNews(entry.ticker, key, now())));
    } catch (error) {
      status.finnhub = message(error);
    }
    return articles;
  }

  function isNew(
    entry: Entry,
    article: Article,
    feed: Feed,
    seen: Set<string>,
    candidates: Candidate[],
  ) {
    if (seen.has(article.url)) return false;
    seen.add(article.url);
    if (now().getTime() - Date.parse(article.publishedAt) > maxAgeMs) return false;
    const same = (title: string) => sameStory(title, article.title);
    if (feed.alerts.some((alert) => alert.entryId === entry.id && same(alert.title))) return false;
    return !candidates.some((item) => item.entry.id === entry.id && same(item.article.title));
  }

  async function rate(
    candidates: Candidate[],
    quotes: Record<string, Quote>,
    seen: Set<string>,
    status: Partial<Feed["status"]>,
  ) {
    const fresh: Alert[] = [];
    if (!generate) {
      status.model = "Dieser PandaOS-Host kann noch keine Modellaufrufe für Plugins.";
      for (const { article } of candidates) seen.delete(article.url);
      return fresh;
    }
    status.model = "";
    for (const { article } of candidates.slice(maxAssessmentsPerRun)) seen.delete(article.url);
    for (const { entry, article } of candidates.slice(0, maxAssessmentsPerRun)) {
      const receivedAt = now().toISOString();
      const price = entry.ticker ? quotes[entry.ticker] : undefined;
      try {
        const result = await assess(generate, { entry, article, receivedAt, quote: price });
        status.model = "";
        if (!result.relevant) continue;
        fresh.push({
          id: randomUUID(),
          storyKey: article.url,
          entryId: entry.id,
          source: article.source,
          title: article.title,
          url: article.url,
          domain: article.domain,
          publishedAt: article.publishedAt,
          receivedAt,
          direction: result.direction,
          strength: result.strength,
          summary: result.summary,
          reasoning: result.reasoning,
          priced: result.priced,
          priceAtReceipt: price,
          priceLatest: price,
          notified: false,
          chat: [],
        });
      } catch (error) {
        status.model = message(error);
        seen.delete(article.url);
      }
    }
    return fresh;
  }

  async function notify(
    fresh: Alert[],
    entries: Entry[],
    config: { telegramToken: string; telegramChatId: string },
    status: Partial<Feed["status"]>,
  ) {
    if (!config.telegramToken || !config.telegramChatId) return;
    for (const alert of fresh) {
      if (alert.strength === "low") continue;
      try {
        const entry = entries.find((item) => item.id === alert.entryId);
        await sendTelegram(config.telegramToken, config.telegramChatId, alertText(alert, entry));
        alert.notified = true;
        status.telegram = "";
      } catch (error) {
        status.telegram = message(error);
      }
    }
  }

  async function cycle(force: boolean) {
    const [{ entries }, config, feed] = await Promise.all([
      stores.watchlist.read(),
      stores.config.read(),
      stores.feed.read(),
    ]);
    const status: Partial<Feed["status"]> = { lastRun: now().toISOString() };
    const quotes = {
      ...feed.quotes,
      ...(await readQuotes(entries, config.finnhubKey, status)),
    };
    const polledAt: Record<string, string> = {};
    const seen = new Set(feed.seen);
    const candidates: Candidate[] = [];
    for (const entry of entries) {
      const last = feed.polledAt[entry.id];
      if (!force && last && now().getTime() - Date.parse(last) < pollEveryMs) continue;
      for (const article of await articlesFor(entry, config.finnhubKey, status)) {
        if (isNew(entry, article, feed, seen, candidates)) candidates.push({ entry, article });
      }
      polledAt[entry.id] = now().toISOString();
    }
    const fresh = await rate(candidates, quotes, seen, status);
    await notify(fresh, entries, config, status);
    const tickerOf = new Map(entries.map((entry) => [entry.id, entry.ticker]));
    await stores.feed.update((current) => ({
      alerts: [
        ...fresh,
        ...current.alerts.map((alert) => {
          const latest = quotes[tickerOf.get(alert.entryId) ?? ""];
          return latest ? Object.assign({}, alert, { priceLatest: latest }) : alert;
        }),
      ].slice(0, 500),
      seen: [...seen].slice(-5000),
      polledAt: { ...current.polledAt, ...polledAt },
      quotes,
      status: { ...current.status, ...status },
    }));
    return fresh;
  }

  function run(force = false) {
    if (running) return false;
    running = cycle(force)
      .then(() => undefined)
      .catch((error) => console.error("Aktien-Poller fehlgeschlagen", error))
      .finally(() => {
        running = null;
      });
    return true;
  }

  return { run, cycle };
}
