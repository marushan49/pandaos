import { useCallback } from "react";
import { View, type NativeSyntheticEvent, type TextInputKeyPressEventData } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { isWeb } from "@/constants/platform";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import type { UrlSuggestion } from "@/desktop/browser/suggestions";
import { useUrlSuggestionList } from "@/desktop/browser/use-url-suggestion-list";
import {
  UrlSuggestionRows,
  urlSuggestionStyles,
  useKeepInputFocus,
} from "@/desktop/browser/pane/url-suggestion-row";

interface UseRemoteUrlSuggestionsInput {
  serverId: string;
  workspaceId: string;
  browserId: string;
  enabled: boolean;
  onOpenUrl: (url: string) => void;
  onSetInputText: (text: string) => void;
}

export function useRemoteUrlSuggestions(input: UseRemoteUrlSuggestionsInput) {
  const client = useHostRuntimeClient(input.serverId);
  const hostPasswords = useHostFeature(input.serverId, "browserProfileImport");
  const canListLogins = client !== null && hostPasswords;
  const fetchLoginOrigins = useCallback(async (): Promise<string[]> => {
    const result = await client?.manageBrowserPasswords({ action: "list" });
    if (!result || result.error) {
      return [];
    }
    return result.logins.map((login) => login.origin);
  }, [client]);

  const list = useUrlSuggestionList({
    ...input,
    fetchLoginOrigins: canListLogins ? fetchLoginOrigins : null,
  });
  const { handleKey } = list;

  const handleKeyPress = useCallback(
    (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      const native = event.nativeEvent as TextInputKeyPressEventData & {
        shiftKey?: boolean;
        preventDefault?: () => void;
      };
      if (!isWeb || native.key === "Enter") {
        return;
      }
      if (handleKey(native.key, native.shiftKey === true)) {
        native.preventDefault?.();
      }
    },
    [handleKey],
  );

  return { ...list, handleKeyPress };
}

export function RemoteUrlSuggestionList({
  visible,
  suggestions,
  selectedIndex,
  onActivate,
}: {
  visible: boolean;
  suggestions: readonly UrlSuggestion[];
  selectedIndex: number;
  onActivate: (index: number) => void;
}) {
  const { t } = useTranslation();
  const setSurfaceNode = useKeepInputFocus();

  if (!visible) {
    return null;
  }

  return (
    <View
      ref={setSurfaceNode}
      collapsable={false}
      role="list"
      aria-label={t("workspace.browser.suggestions.label")}
      style={[urlSuggestionStyles.surface, styles.list]}
    >
      <UrlSuggestionRows
        suggestions={suggestions}
        selectedIndex={selectedIndex}
        onActivate={onActivate}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: {
    position: "absolute",
    top: 0,
    left: theme.spacing[2],
    right: theme.spacing[2],
    zIndex: 10,
    elevation: 10,
  },
}));
