import { randomUUID } from "node:crypto";
import { open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { ZodType, output } from "zod";
import {
  configSchema,
  entryDraft,
  feedSchema,
  watchlistSchema,
  type Config,
  type EntryDraft,
  type Feed,
  type Watchlist,
} from "../shared/model.ts";

function jsonFile<Schema extends ZodType>(file: string, schema: Schema, empty: output<Schema>) {
  let queue: Promise<unknown> = Promise.resolve();
  async function read(): Promise<output<Schema>> {
    try {
      return schema.parse(JSON.parse(await readFile(file, "utf8")));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return empty;
      throw new Error(`${file} konnte nicht gelesen werden. Datei bleibt erhalten.`, {
        cause: error,
      });
    }
  }
  async function write(edit: (current: output<Schema>) => output<Schema>) {
    const next = schema.parse(edit(await read()));
    const temporary = `${file}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(next, null, 2)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, file);
    return next;
  }
  function update(edit: (current: output<Schema>) => output<Schema>): Promise<output<Schema>> {
    const run = queue.then(() => write(edit));
    queue = run.catch(() => undefined);
    return run;
  }
  return { read, update };
}

export function createStores(directory: string) {
  const watchlist = jsonFile(join(directory, "watchlist.json"), watchlistSchema, {
    revision: 0,
    entries: [],
  } satisfies Watchlist);
  const feed = jsonFile(join(directory, "feed.json"), feedSchema, {
    alerts: [],
    seen: [],
    polledAt: {},
    quotes: {},
    status: { gdelt: "", finnhub: "", model: "", telegram: "", lastRun: "" },
  } satisfies Feed);
  const config = jsonFile(join(directory, "config.json"), configSchema, {
    finnhubKey: "",
    telegramToken: "",
    telegramChatId: "",
  } satisfies Config);

  function change(revision: number, edit: (current: Watchlist) => Watchlist["entries"]) {
    return watchlist.update((current) => {
      if (current.revision !== revision)
        throw new Error("Die Liste wurde inzwischen geändert. Bitte erneut speichern.");
      return { revision: current.revision + 1, entries: edit(current) };
    });
  }
  return {
    watchlist,
    feed,
    config,
    saveEntry: (revision: number, draft: EntryDraft, id?: string) =>
      change(revision, (current) => {
        const entry = { ...entryDraft.parse(draft), id: id ?? randomUUID() };
        const index = current.entries.findIndex((item) => item.id === entry.id);
        if (id && index < 0) throw new Error("Dieser Eintrag wurde inzwischen entfernt.");
        const entries = [...current.entries];
        if (index < 0) entries.push(entry);
        else entries[index] = entry;
        return entries;
      }),
    saveEntries: (revision: number, drafts: EntryDraft[]) =>
      change(revision, (current) => {
        const entries = [...current.entries];
        for (const draft of drafts) {
          const parsed = entryDraft.parse(draft);
          const index = entries.findIndex(
            (item) => item.name.toLowerCase() === parsed.name.toLowerCase(),
          );
          if (index < 0) entries.push({ ...parsed, id: randomUUID() });
          else entries[index] = { ...parsed, id: entries[index].id };
        }
        return entries;
      }),
    removeEntry: (revision: number, id: string) =>
      change(revision, (current) => current.entries.filter((item) => item.id !== id)),
  };
}

export type Stores = ReturnType<typeof createStores>;
