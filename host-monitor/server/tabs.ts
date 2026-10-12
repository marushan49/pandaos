import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { HostTab } from "../shared/host";

type PaseoApi = PluginHandlerContext["paseo"];

interface BrowserCommandResult {
  ok: boolean;
  result?: {
    command: string;
    tabs?: { browserId: string; url: string; title: string; isActive: boolean }[];
  };
  error?: { message: string };
}

interface BrowserActions {
  execute(input: {
    workspaceId: string;
    command:
      | { command: "list_tabs"; args: object }
      | { command: "close_tab"; args: { browserId: string } };
  }): Promise<BrowserCommandResult>;
}

interface SavedTab {
  browserId: string;
  workspaceId: string;
  url: string;
}

const SAVED_TABS_PATH = ["browser-profiles", "open-tabs.json"];

function browserOf(paseo: PaseoApi): BrowserActions | null {
  return (paseo as PaseoApi & { browser?: BrowserActions }).browser ?? null;
}

export function canCloseTabs(paseo: PaseoApi): boolean {
  return browserOf(paseo) !== null;
}

async function readSavedTabs(): Promise<SavedTab[]> {
  const home = process.env.PASEO_HOME;
  if (!home) return [];
  const text = await readFile(join(home, ...SAVED_TABS_PATH), "utf8").catch(() => "[]");
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (entry): entry is SavedTab =>
      typeof entry?.browserId === "string" &&
      typeof entry?.workspaceId === "string" &&
      typeof entry?.url === "string",
  );
}

function openedAt(browserId: string): number | null {
  const stamp = Number(browserId.split("-")[0]);
  return Number.isFinite(stamp) && stamp > 1e12 ? stamp : null;
}

export async function listTabs(paseo: PaseoApi): Promise<HostTab[]> {
  const saved = await readSavedTabs();
  const browser = browserOf(paseo);
  const workspaceIds = [...new Set(saved.map((tab) => tab.workspaceId))];
  const { entries } = await paseo.workspaces.list();
  const titles = new Map(entries.map((workspace) => [workspace.id, workspace.name]));
  const now = Date.now();
  const toTab = (
    workspaceId: string,
    tab: { browserId: string; url: string; title: string },
    loaded: boolean | null,
  ): HostTab => {
    const opened = openedAt(tab.browserId);
    return {
      browserId: tab.browserId,
      workspaceId,
      workspace: titles.get(workspaceId) ?? null,
      url: tab.url,
      title: tab.title,
      loaded,
      ageMinutes: opened === null ? null : Math.max(0, Math.round((now - opened) / 60_000)),
    };
  };
  if (!browser) return saved.map((tab) => toTab(tab.workspaceId, { ...tab, title: "" }, null));
  const lists = await Promise.all(
    workspaceIds.map(async (workspaceId) => {
      const response = await browser.execute({
        workspaceId,
        command: { command: "list_tabs", args: {} },
      });
      return (response.ok ? (response.result?.tabs ?? []) : []).map((tab) =>
        toTab(workspaceId, tab, tab.isActive),
      );
    }),
  );
  return lists.flat();
}

export async function closeTab(
  paseo: PaseoApi,
  input: { workspaceId: string; browserId: string },
): Promise<{ closed: boolean; message: string }> {
  const browser = browserOf(paseo);
  if (!browser) return { closed: false, message: "Update this host to close tabs from here." };
  const response = await browser.execute({
    workspaceId: input.workspaceId,
    command: { command: "close_tab", args: { browserId: input.browserId } },
  });
  return response.ok
    ? { closed: true, message: "Tab closed." }
    : { closed: false, message: response.error?.message ?? "The tab was not closed." };
}
