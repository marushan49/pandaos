import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard, SettingsRow } from "@/components/settings";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/toast-context";
import { useBrowserHistoryEntries, useBrowserHistoryStore } from "@/desktop/browser/store/history";
import { confirmDialog } from "@/utils/confirm-dialog";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";

export function BrowserHistorySection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const entries = useBrowserHistoryEntries(serverId);
  const clearHistory = useBrowserHistoryStore((state) => state.clearHistory);
  const client = useHostRuntimeClient(serverId);
  const syncsHistory = useHostFeature(serverId, "browserProfileSync");

  const handleClear = useCallback(async () => {
    const confirmed = await confirmDialog({
      title: t("settings.browser.history.confirmTitle"),
      message: t("settings.browser.history.confirmMessage"),
      confirmLabel: t("settings.browser.history.clear"),
      cancelLabel: t("common.actions.cancel"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    clearHistory(serverId);
    if (client && syncsHistory) {
      await client.syncBrowserProfile({ history: { entries: [], clear: true } }).catch(() => null);
    }
    toast.show(t("settings.browser.history.success"), { variant: "success" });
  }, [clearHistory, client, serverId, syncsHistory, t, toast]);

  return (
    <SettingsSection
      title={t("settings.browser.history.title")}
      info={t("settings.browser.history.info")}
    >
      <SettingsCard>
        <SettingsRow
          label={t("settings.browser.history.label")}
          hint={
            entries.length === 0
              ? t("settings.browser.history.empty")
              : t("settings.browser.history.hint")
          }
        >
          <Button variant="outline" size="sm" disabled={entries.length === 0} onPress={handleClear}>
            {t("settings.browser.history.clear")}
          </Button>
        </SettingsRow>
      </SettingsCard>
    </SettingsSection>
  );
}
