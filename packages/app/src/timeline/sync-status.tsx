import type { Theme } from "@/styles/theme";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import type { AgentScreenReadySyncState } from "@/hooks/use-agent-screen-state-machine";
import { useTranslation } from "react-i18next";
import { withUnistyles } from "react-native-unistyles";
import { ToastViewport, type ToastState } from "@/components/toast-host";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

const spinnerColor = (theme: Theme) => ({ color: theme.colors.foreground });
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const keepUntilSynchronized = () => {};

export function TimelineSyncStatus({
  sync,
  toast,
  onDismiss,
  onReconnect,
}: {
  sync: AgentScreenReadySyncState | null;
  toast: ToastState | null;
  onDismiss: () => void;
  onReconnect?: () => void;
}) {
  const { t } = useTranslation();
  let state: "reconnecting" | "updating" | null = null;
  if (sync?.status === "reconnecting") state = "reconnecting";
  else if (sync?.status === "catching_up" && sync.ui === "status") state = "updating";
  const label = state ? t(`agentPanel.states.${state}`) : null;
  const reconnectLabel = t("agentPanel.reconnect");
  const syncToast = useMemo<ToastState | null>(
    () =>
      state && label
        ? {
            id: state === "reconnecting" ? 1 : 2,
            content:
              state === "reconnecting" && onReconnect ? (
                <View style={styles.reconnectRow}>
                  <Text style={styles.label}>{label}</Text>
                  <Button size="xs" onPress={onReconnect} testID="agent-reconnect-button">
                    {reconnectLabel}
                  </Button>
                </View>
              ) : (
                label
              ),
            nativeMessage: label,
            icon: <ThemedLoadingSpinner size={18} uniProps={spinnerColor} />,
            variant: "default",
            durationMs: null,
            testID: `agent-${state}-toast`,
          }
        : null,
    [state, label, onReconnect, reconnectLabel],
  );
  return (
    <ToastViewport
      toast={toast ?? syncToast}
      onDismiss={toast ? onDismiss : keepUntilSynchronized}
      placement="panel"
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  reconnectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  label: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
}));
