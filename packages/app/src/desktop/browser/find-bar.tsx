import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { PaneFind, findShortcutPlatform, isFindShortcut, type PaneFindHandle } from "@/pane-find";
import { isWeb } from "@/constants/platform";
import { hasActiveWebOverlay } from "@/lib/overlay-root";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { isImeComposingKeyboardEvent } from "@/utils/keyboard-ime";

export interface BrowserFindResult {
  found: boolean;
  total: number;
}

export function findInPageFunction(input: {
  text: string;
  backwards: boolean;
  restart: boolean;
}): string {
  const text = JSON.stringify(input.text);
  return `() => {
  if (${input.restart}) window.getSelection()?.removeAllRanges();
  const found = window.find(${text}, false, ${input.backwards}, true);
  const haystack = (document.body?.innerText ?? "").toLowerCase();
  const needle = ${text}.toLowerCase();
  let total = 0;
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + needle.length)) total += 1;
  return { found, total };
}`;
}

export interface BrowserFindHandle {
  open(): void;
}

export const BrowserFind = forwardRef<
  BrowserFindHandle,
  {
    active: boolean;
    onFind(input: {
      text: string;
      backwards: boolean;
      restart: boolean;
    }): Promise<BrowserFindResult>;
  }
>(function BrowserFind({ active: canInteract, onFind }, ref) {
  const isPanelActive = useRetainedPanelActive();
  const active = isPanelActive && canInteract;
  const { t } = useTranslation();
  const widget = useRef<PaneFindHandle>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<BrowserFindResult | null>(null);
  const show = useCallback(() => {
    setOpen(true);
    widget.current?.focus();
  }, []);
  useImperativeHandle(ref, () => ({ open: show }), [show]);
  useEffect(() => {
    if (!isWeb || !active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || hasActiveWebOverlay() || isImeComposingKeyboardEvent(event))
        return;
      if (isFindShortcut(event, findShortcutPlatform())) {
        event.preventDefault();
        show();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, show]);
  const run = useCallback(
    (text: string, backwards: boolean, restart: boolean) => {
      if (!text) {
        setResult(null);
        return;
      }
      void onFind({ text, backwards, restart }).then(setResult, () => setResult(null));
    },
    [onFind],
  );
  const search = useCallback(
    (text: string) => {
      setQuery(text);
      run(text, false, true);
    },
    [run],
  );
  const close = useCallback(() => {
    setOpen(false);
    setResult(null);
  }, []);
  const next = useCallback(() => run(query, false, false), [query, run]);
  const previous = useCallback(() => run(query, true, false), [query, run]);
  if (!open) return null;
  let status = "";
  if (query && result) {
    status =
      result.total === 0 ? t("paneFind.noMatches") : t("paneFind.total", { total: result.total });
  }
  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View style={styles.frame}>
        <PaneFind
          ref={widget}
          query={query}
          status={status}
          canNavigate={(result?.total ?? 0) > 0}
          onQueryChange={search}
          onNext={next}
          onPrevious={previous}
          onClose={close}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "flex-end",
    zIndex: 2,
  },
  frame: { maxWidth: "100%", padding: theme.spacing[2] },
}));
