import { useEffect } from "react";
import { getIsElectron, isWeb } from "@/constants/platform";
import { useStableEvent } from "@/hooks/use-stable-event";

export const OPEN_LINK_IN_BROWSER_EVENT = "paseo:open-link-in-browser";

interface OpenLinkInBrowserDetail {
  url?: unknown;
  handled?: boolean;
}

export function readOpenLinkInBrowserUrl(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") {
    return null;
  }
  const { url } = detail as OpenLinkInBrowserDetail;
  if (typeof url !== "string") {
    return null;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function useOpenLinkInBrowserRequests(input: {
  workspaceKey: string | null;
  isFocused: boolean;
  openUrl: (url: string) => void;
}): void {
  const handleRequest = useStableEvent((event: Event) => {
    const detail = (event as CustomEvent<OpenLinkInBrowserDetail>).detail;
    if (!detail || detail.handled) {
      return;
    }
    const url = readOpenLinkInBrowserUrl(detail);
    if (!url) {
      return;
    }
    input.openUrl(url);
    detail.handled = true;
  });

  useEffect(() => {
    if (!input.workspaceKey || !input.isFocused || !isWeb || !getIsElectron()) {
      return;
    }
    window.addEventListener(OPEN_LINK_IN_BROWSER_EVENT, handleRequest);
    return () => window.removeEventListener(OPEN_LINK_IN_BROWSER_EVENT, handleRequest);
  }, [handleRequest, input.workspaceKey, input.isFocused]);
}
