import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createGdeltQueue, gdeltQuery, RateLimited, type Article } from "./gdelt.ts";
import { createPoller, sameStory } from "./poller.ts";
import { createStores } from "./store.ts";

test("GDELT queue spaces requests and backs off on 429", async () => {
  let clock = 0;
  const waits: number[] = [];
  const calls: number[] = [];
  let failures = 2;
  const queue = createGdeltQueue({
    now: () => clock,
    sleep: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    fetcher: async () => {
      calls.push(clock);
      if (failures-- > 0) throw new RateLimited("429");
      return [];
    },
  });
  await queue("a");
  await queue("b");
  assert.deepEqual(waits, [30_000, 60_000, 6000]);
  assert.deepEqual(calls, [0, 30_000, 90_000, 96_000]);
  const blocked = createGdeltQueue({
    sleep: async () => undefined,
    fetcher: async () => {
      throw new RateLimited("429");
    },
  });
  await assert.rejects(blocked("x"), /30 und 60 Sekunden/);
  assert.equal(gdeltQuery(["Hormuz", "oil tanker"]), '(Hormuz OR "oil tanker")');
});

test("same story is detected across outlets", () => {
  assert.ok(sameStory("Nvidia beats earnings estimates again", "NVIDIA beats earnings estimates"));
  assert.ok(!sameStory("Nvidia beats earnings estimates", "Iran closes Strait of Hormuz"));
});

test("poller deduplicates, filters irrelevant news and stores alerts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pandaos-aktien-test-"));
  try {
    const stores = createStores(directory);
    const list = await stores.saveEntries(0, [
      { name: "Brent 3x", kind: "holding", instrument: "fund", leverage: 3, keywords: ["Hormuz"] },
    ]);
    assert.equal((await stat(join(directory, "watchlist.json"))).mode & 0o777, 0o600);
    await assert.rejects(stores.saveEntries(0, [{ name: "x", kind: "watch", keywords: ["ab"] }]));
    const now = new Date("2026-10-21T12:00:00Z");
    const article = (url: string, title: string): Article => ({
      url,
      title,
      domain: "example.com",
      publishedAt: "2026-10-21T11:30:00Z",
      source: "gdelt",
    });
    const prompts: string[] = [];
    const poller = createPoller({
      stores,
      now: () => now,
      gdelt: async () => [
        article("https://a.test/1", "Iran threatens to close Strait of Hormuz"),
        article("https://b.test/1", "Iran threatens to close the Strait of Hormuz"),
        article("https://c.test/1", "Hormuz restaurant opens in Berlin"),
      ],
      generate: async ({ prompt, schema }) => {
        assert.ok(!("$schema" in schema));
        prompts.push(prompt);
        const relevant = !prompt.includes("restaurant");
        return {
          relevant,
          direction: "positive",
          strength: "high",
          summary: "Angebotsrisiko steigt.",
          reasoning: "Ölpreis steigt, Hebel 3 verstärkt das.",
          priced: "unknown",
        };
      },
    });
    const fresh = await poller.cycle(true);
    assert.equal(prompts.length, 2);
    assert.match(prompts[0], /"leverage":3/);
    assert.equal(fresh.length, 1);
    assert.equal(fresh[0].entryId, list.entries[0].id);
    const feed = await stores.feed.read();
    assert.equal(feed.alerts.length, 1);
    assert.equal(feed.seen.length, 3);
    assert.equal((await poller.cycle(true)).length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
