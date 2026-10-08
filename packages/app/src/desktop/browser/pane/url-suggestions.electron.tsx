import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Globe, History, Layers, Lock, Search } from "@/components/icons/ui-icons";
import { FloatingSurface } from "@/components/ui/floating";
import type { EditingTextInputHandle } from "@/components/ui/text-input";
import { getDesktopHost } from "@/desktop/host";
import { useBrowserStore } from "@/desktop/browser/store";
import { useBrowserHistoryStore } from "@/desktop/browser/store/history";
import {
  buildSuggestions,
  displayUrl,
  hostOf,
  inlineCompletion,
  type SuggestionTab,
  type UrlSuggestion,
} from "@/desktop/browser/suggestions";
import {
  getOverlayRoot,
  OverlayLayerProvider,
  useOverlayLayer,
  useWebOverlayRegistration,
} from "@/lib/overlay-root";
import { SPACING } from "@/styles/theme";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { collectAllTabs, useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";

const LOGIN_ORIGINS_TTL_MS = 60_000;

interface UseUrlSuggestionsInput {
  serverId: string;
  workspaceId: string;
  browserId: string;
  enabled: boolean;
  inputRef: RefObject<EditingTextInputHandle | null>;
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

export function useUrlSuggestions(input: UseUrlSuggestionsInput) {
  const { serverId, workspaceId, browserId, enabled, inputRef, onOpenUrl, onSetInputText } = input;
  const layer = useOverlayLayer("floating");
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
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
    const list = getDesktopHost()?.browser?.listSavedPasswords;
    if (!list || Date.now() - loginOriginsLoadedAtRef.current < LOGIN_ORIGINS_TTL_MS) {
      return;
    }
    loginOriginsLoadedAtRef.current = Date.now();
    void list()
      .then((result) => {
        setLoginOrigins([...new Set(result.logins.map((login) => login.origin))]);
        return undefined;
      })
      .catch(() => {
        loginOriginsLoadedAtRef.current = 0;
      });
  }, []);

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

  const handleKeyDown = useCallback(
    (event: KeyboardEvent): boolean => {
      if (!inputRef.current?.isFocused() || suggestions.length === 0) {
        return false;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const slots = suggestions.length + 1;
        const delta = event.key === "ArrowDown" ? 1 : -1;
        event.preventDefault();
        setSelectedIndex((current) => ((current + 1 + delta + slots) % slots) - 1);
        return true;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return true;
      }
      if (event.key === "Tab" && !event.shiftKey) {
        const completion = inlineCompletion(query ?? "", suggestions, selectedIndex);
        if (!completion) {
          return false;
        }
        event.preventDefault();
        onSetInputText(completion);
        handleTextChange(completion);
        return true;
      }
      if (event.key === "Enter") {
        const suggestion = suggestions[selectedIndex];
        if (suggestion) {
          event.preventDefault();
          activate(suggestion);
          return true;
        }
        close();
      }
      return false;
    },
    [
      activate,
      close,
      handleTextChange,
      inputRef,
      onSetInputText,
      query,
      selectedIndex,
      suggestions,
    ],
  );

  const setOverlayScope = useWebOverlayRegistration({
    active: visible,
    layer,
    onKeyDown: handleKeyDown,
    manageFocus: false,
  });

  const setAnchorNode = useCallback(
    (node: unknown) => {
      setAnchor(node instanceof HTMLElement ? node : null);
      setOverlayScope(node);
    },
    [setOverlayScope],
  );

  return {
    anchor,
    setAnchorNode,
    layer,
    suggestions,
    selectedIndex,
    visible,
    close,
    handleTextChange,
    handleActivateIndex,
  };
}

function useAnchorRect(anchor: HTMLElement | null, active: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !active) {
      setRect(null);
      return;
    }
    const update = () => setRect(anchor.getBoundingClientRect());
    update();
    const observer = new ResizeObserver(update);
    observer.observe(anchor);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [active, anchor]);

  return rect;
}

const ThemedGlobe = withUnistyles(Globe);
const ThemedHistory = withUnistyles(History);
const ThemedLayers = withUnistyles(Layers);
const ThemedLock = withUnistyles(Lock);
const ThemedSearch = withUnistyles(Search);
const mutedIconMapping = (theme: { colors: { foregroundMuted: string } }) => ({
  color: theme.colors.foregroundMuted,
});

function SuggestionIcon({ kind }: { kind: UrlSuggestion["kind"] }) {
  if (kind === "tab") return <ThemedLayers size={14} uniProps={mutedIconMapping} />;
  if (kind === "history") return <ThemedHistory size={14} uniProps={mutedIconMapping} />;
  if (kind === "login") return <ThemedLock size={14} uniProps={mutedIconMapping} />;
  if (kind === "search") return <ThemedSearch size={14} uniProps={mutedIconMapping} />;
  return <ThemedGlobe size={14} uniProps={mutedIconMapping} />;
}

function describeSuggestion(
  suggestion: UrlSuggestion,
  t: (key: string, options?: Record<string, unknown>) => string,
): { primary: string; secondary: string; hint: string } {
  if (suggestion.kind === "tab") {
    return {
      primary: suggestion.title || hostOf(suggestion.url) || displayUrl(suggestion.url),
      secondary: displayUrl(suggestion.url),
      hint: t("workspace.browser.suggestions.switchToTab"),
    };
  }
  if (suggestion.kind === "history") {
    return {
      primary: suggestion.title || displayUrl(suggestion.url),
      secondary: suggestion.title ? displayUrl(suggestion.url) : "",
      hint: "",
    };
  }
  if (suggestion.kind === "login") {
    return {
      primary: suggestion.title,
      secondary: "",
      hint: t("workspace.browser.suggestions.savedLogin"),
    };
  }
  if (suggestion.kind === "open") {
    return {
      primary: t("workspace.browser.suggestions.open", { url: displayUrl(suggestion.url) }),
      secondary: "",
      hint: "",
    };
  }
  return {
    primary: t("workspace.browser.suggestions.searchWeb", { text: suggestion.query }),
    secondary: "",
    hint: "",
  };
}

function UrlSuggestionRow({
  suggestion,
  index,
  selected,
  onActivate,
}: {
  suggestion: UrlSuggestion;
  index: number;
  selected: boolean;
  onActivate: (index: number) => void;
}) {
  const { t } = useTranslation();
  const { primary, secondary, hint } = describeSuggestion(suggestion, t);
  const handlePress = useCallback(() => onActivate(index), [index, onActivate]);
  const rowStyle = useCallback(
    ({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.row,
      (hovered || selected) && styles.rowActive,
    ],
    [selected],
  );

  return (
    <Pressable role="listitem" aria-selected={selected} onPress={handlePress} style={rowStyle}>
      <View style={styles.rowLeading}>
        <SuggestionIcon kind={suggestion.kind} />
      </View>
      <View style={styles.rowMain}>
        <Text numberOfLines={1} style={styles.rowPrimary}>
          {primary}
        </Text>
        {secondary ? (
          <Text numberOfLines={1} style={styles.rowSecondary}>
            {secondary}
          </Text>
        ) : null}
      </View>
      {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
    </Pressable>
  );
}

export function UrlSuggestionsPopover({
  anchor,
  layer,
  visible,
  suggestions,
  selectedIndex,
  onActivate,
}: {
  anchor: HTMLElement | null;
  layer: number;
  visible: boolean;
  suggestions: readonly UrlSuggestion[];
  selectedIndex: number;
  onActivate: (index: number) => void;
}) {
  const { t } = useTranslation();
  const rect = useAnchorRect(anchor, visible);
  const [surface, setSurface] = useState<HTMLElement | null>(null);

  const setSurfaceNode = useCallback((node: unknown) => {
    setSurface(node instanceof HTMLElement ? node : null);
  }, []);

  useEffect(() => {
    if (!surface) {
      return;
    }
    const keepInputFocus = (event: MouseEvent) => event.preventDefault();
    surface.addEventListener("mousedown", keepInputFocus);
    return () => surface.removeEventListener("mousedown", keepInputFocus);
  }, [surface]);

  const frameStyle = useMemo(
    () =>
      rect
        ? {
            position: "absolute" as const,
            top: rect.bottom + SPACING[1],
            left: rect.left,
            width: rect.width,
          }
        : undefined,
    [rect],
  );

  if (!visible || !rect) {
    return null;
  }

  return createPortal(
    <OverlayLayerProvider layer={layer}>
      <View pointerEvents="box-none" style={[styles.overlay, { zIndex: layer }]}>
        <FloatingSurface
          ref={setSurfaceNode}
          collapsable={false}
          pointerEvents="auto"
          role="list"
          aria-label={t("workspace.browser.suggestions.label")}
          style={styles.surface}
          frameStyle={frameStyle}
        >
          {suggestions.map((suggestion, index) => (
            <UrlSuggestionRow
              key={suggestion.id}
              suggestion={suggestion}
              index={index}
              selected={index === selectedIndex}
              onActivate={onActivate}
            />
          ))}
        </FloatingSurface>
      </View>
    </OverlayLayerProvider>,
    getOverlayRoot(),
  );
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  surface: {
    paddingVertical: theme.spacing[1],
    backgroundColor: theme.colors.surface1,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.lg,
    ...theme.shadow.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minHeight: 32,
    marginHorizontal: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  rowActive: {
    backgroundColor: theme.colors.surface2,
  },
  rowLeading: {
    width: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  rowPrimary: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
  },
  rowSecondary: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  rowHint: {
    flexShrink: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
