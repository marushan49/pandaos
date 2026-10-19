import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  BrowserSyncHistoryEntrySchema,
  type BrowserSyncCookie,
  type BrowserSyncHistoryEntry,
} from "@getpaseo/protocol/browser-settings/rpc-schemas";
import { writeFileAtomic } from "../atomic-file.js";

const MAX_HISTORY_ENTRIES = 2_000;
const HistoryFileSchema = z.object({
  entries: z.array(BrowserSyncHistoryEntrySchema),
  clearedAt: z.number().optional(),
});
type HistoryFile = z.infer<typeof HistoryFileSchema>;

export function cookieVersion(cookies: readonly BrowserSyncCookie[]): string {
  const lines = cookies
    .map((cookie) =>
      [cookie.domain, cookie.path, cookie.name, cookie.value, cookie.expires].join("\t"),
    )
    .sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 32);
}

export function mergeHistory(
  current: readonly BrowserSyncHistoryEntry[],
  incoming: readonly BrowserSyncHistoryEntry[],
): BrowserSyncHistoryEntry[] {
  const byUrl = new Map(current.map((entry) => [entry.url, entry]));
  for (const entry of incoming) {
    const existing = byUrl.get(entry.url);
    if (!existing) {
      byUrl.set(entry.url, entry);
      continue;
    }
    const newer = entry.lastVisitedAt >= existing.lastVisitedAt ? entry : existing;
    byUrl.set(entry.url, {
      url: entry.url,
      title: newer.title || existing.title || entry.title,
      visitCount: Math.max(existing.visitCount, entry.visitCount),
      lastVisitedAt: Math.max(existing.lastVisitedAt, entry.lastVisitedAt),
    });
  }
  return [...byUrl.values()]
    .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
    .slice(0, MAX_HISTORY_ENTRIES);
}

export class BrowserHistoryStore {
  private cached: Promise<HistoryFile> | null = null;

  constructor(private readonly file: string) {}

  private read(): Promise<HistoryFile> {
    this.cached ??= readFile(this.file, "utf8").then(
      (text) => HistoryFileSchema.parse(JSON.parse(text)),
      () => ({ entries: [] }),
    );
    return this.cached;
  }

  async sync(input: {
    entries: readonly BrowserSyncHistoryEntry[];
    clear?: boolean;
  }): Promise<BrowserSyncHistoryEntry[]> {
    const current = await this.read();
    const clearedAt = input.clear ? Date.now() : current.clearedAt;
    const incoming = input.entries.filter(
      (entry) => clearedAt === undefined || entry.lastVisitedAt > clearedAt,
    );
    const next: HistoryFile = {
      entries: mergeHistory(input.clear ? [] : current.entries, incoming),
      ...(clearedAt === undefined ? {} : { clearedAt }),
    };
    await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    await writeFileAtomic(this.file, JSON.stringify(next), { mode: 0o600 });
    this.cached = Promise.resolve(next);
    return next.entries;
  }
}
