import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";
import { toHistoryUrl, type SuggestionHistoryEntry } from "../suggestions";

export const MAX_HISTORY_ENTRIES = 500;
const MAX_HISTORY_TITLE_LENGTH = 200;

export type BrowserHistoryEntry = SuggestionHistoryEntry;

const EMPTY_ENTRIES: readonly BrowserHistoryEntry[] = [];

interface BrowserHistoryState {
  entriesByServerId: Record<string, BrowserHistoryEntry[]>;
}

const BrowserHistoryEntrySchema = z.strictObject({
  url: z.string(),
  title: z.string(),
  visitCount: z.number().int().positive(),
  lastVisitedAt: z.number(),
});

const BrowserHistoryStateSchema: z.ZodType<BrowserHistoryState> = z.strictObject({
  entriesByServerId: z.record(z.string(), z.array(BrowserHistoryEntrySchema)),
});

interface BrowserHistoryStore extends BrowserHistoryState {
  recordVisit: (input: { serverId: string; rawUrl: string; now?: number }) => void;
  updateTitle: (input: { serverId: string; rawUrl: string; title: string }) => void;
  clearHistory: (serverId: string) => void;
}

function cleanTitle(title: string): string {
  return title.trim().slice(0, MAX_HISTORY_TITLE_LENGTH);
}

export function applyHistoryVisit(
  entries: readonly BrowserHistoryEntry[],
  input: { url: string; now: number },
): BrowserHistoryEntry[] {
  const existing = entries.find((entry) => entry.url === input.url);
  const next = existing
    ? entries.map((entry) =>
        entry === existing
          ? { ...entry, visitCount: entry.visitCount + 1, lastVisitedAt: input.now }
          : entry,
      )
    : [...entries, { url: input.url, title: "", visitCount: 1, lastVisitedAt: input.now }];
  return next.length > MAX_HISTORY_ENTRIES
    ? [...next].sort((a, b) => b.lastVisitedAt - a.lastVisitedAt).slice(0, MAX_HISTORY_ENTRIES)
    : next;
}

export const useBrowserHistoryStore = create<BrowserHistoryStore>()(
  persist(
    (set) => ({
      entriesByServerId: {},
      recordVisit: ({ serverId, rawUrl, now = Date.now() }) => {
        const target = toHistoryUrl(rawUrl);
        if (!serverId || !target) {
          return;
        }
        set((state) => ({
          entriesByServerId: {
            ...state.entriesByServerId,
            [serverId]: applyHistoryVisit(state.entriesByServerId[serverId] ?? [], {
              url: target.url,
              now,
            }),
          },
        }));
      },
      updateTitle: ({ serverId, rawUrl, title }) => {
        const target = toHistoryUrl(rawUrl);
        const nextTitle = cleanTitle(title);
        if (!serverId || !target?.titleAllowed || !nextTitle) {
          return;
        }
        set((state) => {
          const entries = state.entriesByServerId[serverId];
          const index = entries?.findIndex((entry) => entry.url === target.url) ?? -1;
          const existing = entries?.[index];
          if (!entries || !existing || existing.title === nextTitle) {
            return state;
          }
          return {
            entriesByServerId: {
              ...state.entriesByServerId,
              [serverId]: [
                ...entries.slice(0, index),
                { ...existing, title: nextTitle },
                ...entries.slice(index + 1),
              ],
            },
          };
        });
      },
      clearHistory: (serverId) => {
        set((state) => {
          if (!state.entriesByServerId[serverId]) {
            return state;
          }
          const rest = { ...state.entriesByServerId };
          delete rest[serverId];
          return { entriesByServerId: rest };
        });
      },
    }),
    {
      name: "workspace-browser-history-store",
      storage: createValidatedPersistStorage(AsyncStorage, BrowserHistoryStateSchema),
      partialize: (state) => ({ entriesByServerId: state.entriesByServerId }),
    },
  ),
);

export function useBrowserHistoryEntries(serverId: string): readonly BrowserHistoryEntry[] {
  return useBrowserHistoryStore((state) => state.entriesByServerId[serverId] ?? EMPTY_ENTRIES);
}
