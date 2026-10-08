import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBrowserStore } from "@/desktop/browser/store";
import { useBrowserHistoryStore } from "@/desktop/browser/store/history";
import {
  buildSuggestions,
  inlineCompletion,
  type SuggestionTab,
  type UrlSuggestion,
} from "@/desktop/browser/suggestions";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { collectAllTabs, useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";

const LOGIN_ORIGINS_TTL_MS = 60_000;

interface UseUrlSuggestionListInput {
  serverId: string;
  workspaceId: string;
  browserId: string;
  enabled: boolean;
  fetchLoginOrigins: (() => Promise<string[]>) | null;
  onOpenUrl: (url: string) => void;
  onSetInputText: (text: string) => void;
}

function readWorkspaceTabs(input: {
  workspaceKey: string | null;
  browserId: string;
}): SuggestionTab[] {
  if (!input.workspaceKey) {
    return [];
  }
  const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[input.workspaceKey];
  if (!layout) {
    return [];
  }
  const { browsersById } = useBrowserStore.getState();
  return collectAllTabs(layout.root).flatMap((tab) => {
    if (tab.target.kind !== "browser" || tab.target.browserId === input.browserId) {
      return [];
    }
    const record = browsersById[tab.target.browserId];
    return record ? [{ tabId: tab.tabId, title: record.title, url: record.url }] : [];
  });
}

export function useUrlSuggestionList(input: UseUrlSuggestionListInput) {
  const {
    serverId,
    workspaceId,
    browserId,
    enabled,
    fetchLoginOrigins,
    onOpenUrl,
    onSetInputText,
  } = input;
  const [query, setQuery] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loginOrigins, setLoginOrigins] = useState<string[]>([]);
  const loginOriginsLoadedAtRef = useRef(0);
  const workspaceKey = useMemo(
    () => buildWorkspaceTabPersistenceKey({ serverId, workspaceId }),
    [serverId, workspaceId],
  );

  const suggestions = useMemo(() => {
    if (query === null) {
      return [];
    }
    return buildSuggestions({
      query,
      tabs: readWorkspaceTabs({ workspaceKey, browserId }),
      history: useBrowserHistoryStore.getState().entriesByServerId[serverId] ?? [],
      loginOrigins,
      now: Date.now(),
    });
  }, [browserId, loginOrigins, query, serverId, workspaceKey]);
  const visible = enabled && suggestions.length > 0;

  const close = useCallback(() => {
    setQuery(null);
    setSelectedIndex(-1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      close();
    }
  }, [close, enabled]);

  const loadLoginOrigins = useCallback(() => {
    if (!fetchLoginOrigins || Date.now() - loginOriginsLoadedAtRef.current < LOGIN_ORIGINS_TTL_MS) {
      return;
    }
    loginOriginsLoadedAtRef.current = Date.now();
    void fetchLoginOrigins()
      .then((origins) => {
        setLoginOrigins([...new Set(origins)]);
        return undefined;
      })
      .catch(() => {
        loginOriginsLoadedAtRef.current = 0;
      });
  }, [fetchLoginOrigins]);

  const handleTextChange = useCallback(
    (text: string) => {
      setSelectedIndex(-1);
      if (text.trim() === "") {
        setQuery(null);
        return;
      }
      setQuery(text);
      loadLoginOrigins();
    },
    [loadLoginOrigins],
  );

  const activate = useCallback(
    (suggestion: UrlSuggestion) => {
      close();
      if (suggestion.kind === "tab") {
        if (workspaceKey) {
          useWorkspaceLayoutStore.getState().focusTab(workspaceKey, suggestion.tabId);
        }
        onSetInputText(useBrowserStore.getState().browsersById[browserId]?.url ?? "");
        return;
      }
      onOpenUrl(suggestion.url);
    },
    [browserId, close, onOpenUrl, onSetInputText, workspaceKey],
  );

  const handleActivateIndex = useCallback(
    (index: number) => {
      const suggestion = suggestions[index];
      if (suggestion) {
        activate(suggestion);
      }
    },
    [activate, suggestions],
  );

  const activateSelected = useCallback((): boolean => {
    const suggestion = visible ? suggestions[selectedIndex] : undefined;
    if (!suggestion) {
      return false;
    }
    activate(suggestion);
    return true;
  }, [activate, selectedIndex, suggestions, visible]);

  const handleKey = useCallback(
    (key: string, shiftKey: boolean): boolean => {
      if (suggestions.length === 0) {
        return false;
      }
      if (key === "ArrowDown" || key === "ArrowUp") {
        const slots = suggestions.length + 1;
        const delta = key === "ArrowDown" ? 1 : -1;
        setSelectedIndex((current) => ((current + 1 + delta + slots) % slots) - 1);
        return true;
      }
      if (key === "Escape") {
        close();
        return true;
      }
      if (key === "Tab" && !shiftKey) {
        const completion = inlineCompletion(query ?? "", suggestions, selectedIndex);
        if (!completion) {
          return false;
        }
        onSetInputText(completion);
        handleTextChange(completion);
        return true;
      }
      if (key === "Enter") {
        if (activateSelected()) {
          return true;
        }
        close();
      }
      return false;
    },
    [activateSelected, close, handleTextChange, onSetInputText, query, selectedIndex, suggestions],
  );

  return {
    suggestions,
    selectedIndex,
    visible,
    close,
    handleTextChange,
    handleActivateIndex,
    activateSelected,
    handleKey,
  };
}
