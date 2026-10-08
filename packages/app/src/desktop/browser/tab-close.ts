import { create } from "zustand";
import type { BrowserTabClose } from "@getpaseo/protocol/browser-activity/rpc-schemas";
import { closeBrowser } from "@/desktop/browser/owner-cleanup";
import { markRemoteBrowserClosed, useBrowserStore } from "@/desktop/browser/store";

function tabKey(serverId: string, workspaceId: string, browserId: string): string {
  return `${serverId}\u0000${workspaceId}\u0000${browserId}`;
}

interface BrowserTabCloseState {
  pendingByBrowser: Record<string, BrowserTabClose>;
  apply: (serverId: string, event: BrowserTabClose) => void;
  resetServer: (serverId: string) => void;
}

export const useBrowserTabCloseStore = create<BrowserTabCloseState>((set) => ({
  pendingByBrowser: {},
  apply: (serverId, event) =>
    set((state) => {
      const key = tabKey(serverId, event.workspaceId, event.browserId);
      const { [key]: _previous, ...rest } = state.pendingByBrowser;
      return { pendingByBrowser: event.status === "pending" ? { ...rest, [key]: event } : rest };
    }),
  resetServer: (serverId) =>
    set((state) => ({
      pendingByBrowser: Object.fromEntries(
        Object.entries(state.pendingByBrowser).filter(
          ([key]) => !key.startsWith(`${serverId}\u0000`),
        ),
      ),
    })),
}));

export function applyBrowserTabClose(serverId: string, event: BrowserTabClose): void {
  useBrowserTabCloseStore.getState().apply(serverId, event);
  if (event.status !== "closed") return;
  markRemoteBrowserClosed(event.browserId);
  for (const record of Object.values(useBrowserStore.getState().browsersById)) {
    if (record.remoteBrowserId === event.browserId) closeBrowser(record.browserId);
  }
}

export function useBrowserTabClosePending(
  serverId: string,
  workspaceId: string,
  browserId: string | null | undefined,
): BrowserTabClose | null {
  return useBrowserTabCloseStore((state) =>
    browserId ? (state.pendingByBrowser[tabKey(serverId, workspaceId, browserId)] ?? null) : null,
  );
}
