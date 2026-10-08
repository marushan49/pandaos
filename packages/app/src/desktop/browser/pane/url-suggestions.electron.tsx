import { useCallback, useLayoutEffect, useMemo, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { FloatingSurface } from "@/components/ui/floating";
import type { EditingTextInputHandle } from "@/components/ui/text-input";
import { getDesktopHost } from "@/desktop/host";
import {
  getOverlayRoot,
  OverlayLayerProvider,
  useOverlayLayer,
  useWebOverlayRegistration,
} from "@/lib/overlay-root";
import { useUrlSuggestionList } from "@/desktop/browser/use-url-suggestion-list";
import type { UrlSuggestion } from "@/desktop/browser/suggestions";
import { SPACING } from "@/styles/theme";
import { UrlSuggestionRows, urlSuggestionStyles, useKeepInputFocus } from "./url-suggestion-row";

interface UseUrlSuggestionsInput {
  serverId: string;
  workspaceId: string;
  browserId: string;
  enabled: boolean;
  inputRef: RefObject<EditingTextInputHandle | null>;
  onOpenUrl: (url: string) => void;
  onSetInputText: (text: string) => void;
}

async function fetchSavedLoginOrigins(): Promise<string[]> {
  const list = getDesktopHost()?.browser?.listSavedPasswords;
  if (!list) {
    return [];
  }
  const result = await list();
  return result.logins.map((login) => login.origin);
}

export function useUrlSuggestions(input: UseUrlSuggestionsInput) {
  const { serverId, workspaceId, browserId, enabled, inputRef, onOpenUrl, onSetInputText } = input;
  const layer = useOverlayLayer("floating");
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const list = useUrlSuggestionList({
    serverId,
    workspaceId,
    browserId,
    enabled,
    fetchLoginOrigins: fetchSavedLoginOrigins,
    onOpenUrl,
    onSetInputText,
  });
  const { handleKey, visible } = list;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent): boolean => {
      if (!inputRef.current?.isFocused()) {
        return false;
      }
      const handled = handleKey(event.key, event.shiftKey);
      if (handled) {
        event.preventDefault();
      }
      return handled;
    },
    [handleKey, inputRef],
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
    suggestions: list.suggestions,
    selectedIndex: list.selectedIndex,
    visible,
    close: list.close,
    handleTextChange: list.handleTextChange,
    handleActivateIndex: list.handleActivateIndex,
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
  const setSurfaceNode = useKeepInputFocus();

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
          style={urlSuggestionStyles.surface}
          frameStyle={frameStyle}
        >
          <UrlSuggestionRows
            suggestions={suggestions}
            selectedIndex={selectedIndex}
            onActivate={onActivate}
          />
        </FloatingSurface>
      </View>
    </OverlayLayerProvider>,
    getOverlayRoot(),
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
});
