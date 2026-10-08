import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Globe, History, Layers, Lock, Search } from "@/components/icons/ui-icons";
import { isWeb } from "@/constants/platform";
import { displayUrl, hostOf, type UrlSuggestion } from "@/desktop/browser/suggestions";

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

export function UrlSuggestionRows({
  suggestions,
  selectedIndex,
  onActivate,
}: {
  suggestions: readonly UrlSuggestion[];
  selectedIndex: number;
  onActivate: (index: number) => void;
}) {
  return suggestions.map((suggestion, index) => (
    <UrlSuggestionRow
      key={suggestion.id}
      suggestion={suggestion}
      index={index}
      selected={index === selectedIndex}
      onActivate={onActivate}
    />
  ));
}

export function useKeepInputFocus(): (node: unknown) => void {
  const [surface, setSurface] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!surface) {
      return;
    }
    const keepInputFocus = (event: MouseEvent) => event.preventDefault();
    surface.addEventListener("mousedown", keepInputFocus);
    return () => surface.removeEventListener("mousedown", keepInputFocus);
  }, [surface]);

  return useCallback((node: unknown) => {
    setSurface(isWeb && node instanceof HTMLElement ? node : null);
  }, []);
}

export const urlSuggestionStyles = StyleSheet.create((theme) => ({
  surface: {
    paddingVertical: theme.spacing[1],
    backgroundColor: theme.colors.surface1,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.lg,
    ...theme.shadow.md,
  },
}));

const styles = StyleSheet.create((theme) => ({
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
