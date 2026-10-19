import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { SettingsCard, SettingsRow } from "@/components/settings";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { getIsElectron } from "@/constants/platform";
import { BrowserDataSection } from "@/desktop/browser/settings/browser-data-section";
import { BrowserHistorySection } from "@/desktop/browser/settings/browser-history-section";
import { BrowserStartPageSection } from "@/desktop/browser/settings/browser-start-page-section";
import { BrowserStreamingSection } from "@/desktop/browser/settings/browser-streaming-section";
import { SavedPasswordsSection } from "@/desktop/browser/settings/saved-passwords-section";
import { BrowserBackupSection } from "@/desktop/browser/settings/browser-backup-section";
import { useHostFeature } from "@/runtime/host-features";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
import { BrowserImportSection } from "./browser-import-section";
import { BrowserToolsOptInCard } from "./browser-tools-card";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import {
  HostBrowserDataSection,
  HostBrowserDownloadsSection,
  HostSitePermissionsSection,
} from "@/desktop/browser/settings/host-browser-sections";

export function HostBrowserPage({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const hostBrowser = useHostFeature(serverId, "browserScreencast");
  const isLocalDaemon = useIsLocalDaemon(serverId);
  const siteSettings = useHostFeature(serverId, "browserSiteSettings");
  const client = useHostRuntimeClient(serverId);
  const hostClient = hostBrowser && siteSettings ? client : null;

  return (
    <View>
      <SettingsSection title={t("settings.browser.title")} info={t("settings.browser.info")}>
        <BrowserToolsOptInCard serverId={serverId} />
        <BrowserStartPageSection />
        <BrowserStreamingSection />
        <SettingsCard>
          <SettingsRow
            label={t("settings.browser.howItWorks.label")}
            hint={t("settings.browser.howItWorks.hint")}
          />
          <SettingsRow
            label={t("settings.browser.jev.label")}
            hint={t("settings.browser.jev.hint")}
          />
          <SettingsRow
            label={t("settings.browser.safety.label")}
            hint={t("settings.browser.safety.hint")}
          />
        </SettingsCard>
      </SettingsSection>
      <BrowserImportSection serverId={serverId} isLocalDaemon={isLocalDaemon} />
      {hostBrowser || getIsElectron() ? <SavedPasswordsSection serverId={serverId} /> : null}
      {hostBrowser || getIsElectron() ? <BrowserHistorySection serverId={serverId} /> : null}
      {getIsElectron() ? <BrowserBackupSection serverId={serverId} /> : null}
      {getIsElectron() && isLocalDaemon && !hostBrowser ? <BrowserDataSection /> : null}
      {hostClient ? <HostBrowserDownloadsSection client={hostClient} serverId={serverId} /> : null}
      {hostClient ? <HostSitePermissionsSection client={hostClient} serverId={serverId} /> : null}
      {hostClient ? <HostBrowserDataSection client={hostClient} /> : null}
    </View>
  );
}
