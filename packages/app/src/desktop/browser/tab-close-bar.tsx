import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { BrowserTabClose } from "@getpaseo/protocol/browser-activity/rpc-schemas";
import { Button } from "@/components/ui/button";
import { useBrowserTabClosePending } from "@/desktop/browser/tab-close";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { formatDuration } from "@/utils/time";

interface BrowserTabCloseBarProps {
  serverId: string;
  workspaceId: string;
  browserId: string | null;
}

type TabCloseAction = "keep_tab_open" | "close_tab_now";

export function BrowserTabCloseBar({ serverId, workspaceId, browserId }: BrowserTabCloseBarProps) {
  const pending = useBrowserTabClosePending(serverId, workspaceId, browserId);
  if (!pending?.closesAt) return null;
  return <PendingTabCloseBar serverId={serverId} pending={pending} closesAt={pending.closesAt} />;
}

interface PendingTabCloseBarProps {
  serverId: string;
  pending: BrowserTabClose;
  closesAt: number;
}

function PendingTabCloseBar({ serverId, pending, closesAt }: PendingTabCloseBarProps) {
  const { t } = useTranslation();
  const client = useHostRuntimeClient(serverId);
  const [now, setNow] = useState(Date.now);
  const [action, setAction] = useState<TabCloseAction | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const send = useCallback(
    (next: TabCloseAction) => {
      if (!client) return;
      setAction(next);
      void client
        .controlBrowserActivity({
          workspaceId: pending.workspaceId,
          browserId: pending.browserId,
          action: next,
        })
        .catch(() => undefined)
        .finally(() => setAction(null));
    },
    [client, pending.browserId, pending.workspaceId],
  );
  const keepOpen = useCallback(() => send("keep_tab_open"), [send]);
  const closeNow = useCallback(() => send("close_tab_now"), [send]);

  return (
    <View style={styles.bar} testID="browser-tab-close-bar">
      <Text numberOfLines={2} style={styles.message}>
        {t("workspace.browser.tabClose.message", { time: formatDuration(closesAt - now) })}
      </Text>
      <Button
        size="xs"
        variant="ghost"
        disabled={action !== null}
        loading={action === "close_tab_now"}
        onPress={closeNow}
        testID="browser-tab-close-now"
      >
        {t("workspace.browser.tabClose.closeNow")}
      </Button>
      <Button
        size="xs"
        variant="outline"
        disabled={action !== null}
        loading={action === "keep_tab_open"}
        onPress={keepOpen}
        testID="browser-tab-keep-open"
      >
        {t("workspace.browser.tabClose.keepOpen")}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  message: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
