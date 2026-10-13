import { getDesktopHost } from "@/desktop/host";
import { removeResidentBrowserWebview } from "@/desktop/browser/resident-webviews";
import { useBrowserStore } from "@/desktop/browser/store";
import { collectAllTabs, useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";

export function closeBrowser(browserId: string): void {
  const layouts = useWorkspaceLayoutStore.getState().layoutByWorkspace;
  for (const [workspaceKey, layout] of Object.entries(layouts)) {
    for (const tab of collectAllTabs(layout.root)) {
      if (tab.target.kind === "browser" && tab.target.browserId === browserId) {
        useWorkspaceLayoutStore.getState().closeTab(workspaceKey, tab.tabId);
      }
    }
  }
  useBrowserStore.getState().removeBrowser(browserId);
  removeResidentBrowserWebview(browserId);
  void getDesktopHost()?.browser?.unregisterWorkspaceBrowser?.(browserId);
}
