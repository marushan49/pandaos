import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  BrowserDownload,
  BrowserSitePermissionName,
  BrowserSitePermissionSetting,
  BrowserSitePermissions,
} from "@getpaseo/protocol/browser-settings/rpc-schemas";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { AdaptiveTextInput } from "@/components/adaptive-text-input";
import { SettingsCard, SettingsRow, SettingsSelect } from "@/components/settings";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import type { EditingTextInputHandle } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/toast-context";
import { useFetchQuery } from "@/data/query";
import { useDownloadStore } from "@/stores/download-store";
import { confirmDialog } from "@/utils/confirm-dialog";

const PERMISSIONS: BrowserSitePermissionName[] = [
  "notifications",
  "geolocation",
  "camera",
  "microphone",
  "clipboard-read",
];
const PERMISSION_KEYS: Record<BrowserSitePermissionName, string> = {
  notifications: "notifications",
  geolocation: "geolocation",
  camera: "camera",
  microphone: "microphone",
  "clipboard-read": "clipboard",
};
const DOWNLOADS_QUERY_KEY = "browser-host-downloads";
const PERMISSIONS_QUERY_KEY = "browser-site-permissions";
const VISIBLE_DOWNLOADS = 20;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function HostBrowserDataSection({ client }: { client: DaemonClient }) {
  const { t } = useTranslation();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: async () => {
      const confirmed = await confirmDialog({
        title: t("settings.browser.hostData.confirmTitle"),
        message: t("settings.browser.hostData.confirmMessage"),
        confirmLabel: t("settings.browser.hostData.clear"),
        cancelLabel: t("common.actions.cancel"),
        destructive: true,
      });
      if (!confirmed) return null;
      const result = await client.clearBrowserData();
      if (result.error) throw new Error(result.error);
      toast.show(t("settings.browser.hostData.success", result), { variant: "success" });
      return result;
    },
  });
  const handleClear = useCallback(() => mutation.mutate(), [mutation]);
  return (
    <SettingsSection title={t("settings.browser.hostData.title")}>
      <SettingsCard>
        <SettingsRow
          label={t("settings.browser.hostData.label")}
          hint={t("settings.browser.hostData.hint")}
          error={mutation.error?.message}
        >
          <Button
            variant="outline"
            size="sm"
            loading={mutation.isPending}
            disabled={mutation.isPending}
            onPress={handleClear}
            testID="host-browser-clear-data"
          >
            {t("settings.browser.hostData.clear")}
          </Button>
        </SettingsRow>
      </SettingsCard>
    </SettingsSection>
  );
}

export function HostBrowserDownloadsSection({
  client,
  serverId,
}: {
  client: DaemonClient;
  serverId: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const downloads = useFetchQuery({
    queryKey: [DOWNLOADS_QUERY_KEY, serverId],
    queryFn: async () => {
      const result = await client.manageBrowserDownloads({ action: "list" });
      if (result.error) throw new Error(result.error);
      return result;
    },
    dataShape: "value",
    staleTimeMs: 0,
  });
  const remove = useMutation({
    mutationFn: async (name: string) => {
      const result = await client.manageBrowserDownloads({ action: "remove", name });
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => queryClient.setQueryData([DOWNLOADS_QUERY_KEY, serverId], result),
  });
  const items = downloads.data?.downloads ?? [];
  const directory = downloads.data?.directory ?? "";
  return (
    <SettingsSection
      title={t("settings.browser.downloads.title")}
      info={t("settings.browser.downloads.info")}
    >
      <SettingsCard>
        <SettingsRow
          label={t("settings.browser.downloads.location")}
          hint={directory || t("settings.browser.downloads.loading")}
          error={downloads.error?.message ?? remove.error?.message}
        />
        {items.length === 0 && !downloads.isPending ? (
          <SettingsRow label={t("settings.browser.downloads.empty")} />
        ) : null}
        {items.slice(0, VISIBLE_DOWNLOADS).map((download) => (
          <HostDownloadRow
            key={download.name}
            client={client}
            serverId={serverId}
            directory={directory}
            download={download}
            onRemove={remove.mutate}
            removing={remove.isPending}
          />
        ))}
      </SettingsCard>
    </SettingsSection>
  );
}

function HostDownloadRow({
  client,
  serverId,
  directory,
  download,
  onRemove,
  removing,
}: {
  client: DaemonClient;
  serverId: string;
  directory: string;
  download: BrowserDownload;
  onRemove: (name: string) => void;
  removing: boolean;
}) {
  const { t } = useTranslation();
  const startDownload = useDownloadStore((state) => state.startDownload);
  const handleSave = useCallback(() => {
    void startDownload({
      serverId,
      scopeId: directory,
      fileName: download.fileName,
      path: download.name,
      readFile: (path) => client.readFile(directory, path),
    });
  }, [client, directory, download, serverId, startDownload]);
  const handleRemove = useCallback(() => onRemove(download.name), [download.name, onRemove]);
  const savedAt = new Date(download.savedAt).toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <SettingsRow label={download.fileName} hint={`${formatBytes(download.bytes)}, ${savedAt}`}>
      <Button variant="outline" size="sm" onPress={handleSave}>
        {t("settings.browser.downloads.save")}
      </Button>
      <Button variant="ghost" size="sm" disabled={removing} onPress={handleRemove}>
        {t("settings.browser.downloads.remove")}
      </Button>
    </SettingsRow>
  );
}

export function HostSitePermissionsSection({
  client,
  serverId,
}: {
  client: DaemonClient;
  serverId: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const originInput = useRef<EditingTextInputHandle | null>(null);
  const [origin, setOrigin] = useState("");
  const [permission, setPermission] = useState<BrowserSitePermissionName>("notifications");
  const permissions = useFetchQuery({
    queryKey: [PERMISSIONS_QUERY_KEY, serverId],
    queryFn: async () => {
      const result = await client.manageBrowserSitePermissions({ action: "get" });
      if (result.error || !result.permissions) throw new Error(result.error ?? "");
      return result.permissions;
    },
    dataShape: "value",
    staleTimeMs: 0,
  });
  const save = useMutation({
    mutationFn: async (next: BrowserSitePermissions) => {
      const result = await client.manageBrowserSitePermissions({
        action: "set",
        permissions: next,
      });
      if (result.error || !result.permissions) throw new Error(result.error ?? "");
      return result.permissions;
    },
    onSuccess: (saved) => queryClient.setQueryData([PERMISSIONS_QUERY_KEY, serverId], saved),
  });
  const current = permissions.data;
  const settingOptions = [
    { value: "allow" as const, label: t("settings.browser.sitePermissions.allow") },
    { value: "block" as const, label: t("settings.browser.sitePermissions.block") },
  ];
  const permissionLabel = (name: BrowserSitePermissionName) =>
    t(`settings.browser.sitePermissions.names.${PERMISSION_KEYS[name]}`);
  const setDefault = useCallback(
    (name: BrowserSitePermissionName, setting: BrowserSitePermissionSetting) => {
      if (current) save.mutate({ ...current, defaults: { ...current.defaults, [name]: setting } });
    },
    [current, save],
  );
  const addException = useCallback(
    (setting: BrowserSitePermissionSetting) => {
      if (!current || !origin.trim()) return;
      const value = origin.includes("://") ? origin.trim() : `https://${origin.trim()}`;
      const sites = current.sites.filter(
        (site) => !(site.origin === value && site.permission === permission),
      );
      save.mutate({ ...current, sites: [...sites, { origin: value, permission, setting }] });
      originInput.current?.replaceText("");
      setOrigin("");
    },
    [current, origin, permission, save],
  );
  const allowException = useCallback(() => addException("allow"), [addException]);
  const blockException = useCallback(() => addException("block"), [addException]);
  const removeException = useCallback(
    (index: number) => {
      if (current) save.mutate({ ...current, sites: current.sites.filter((_, i) => i !== index) });
    },
    [current, save],
  );

  return (
    <SettingsSection
      title={t("settings.browser.sitePermissions.title")}
      info={t("settings.browser.sitePermissions.info")}
    >
      <SettingsCard>
        {current
          ? PERMISSIONS.map((name) => (
              <PermissionDefaultRow
                key={name}
                name={name}
                label={permissionLabel(name)}
                value={current.defaults[name]}
                options={settingOptions}
                onChange={setDefault}
              />
            ))
          : null}
        <SettingsRow
          label={t("settings.browser.sitePermissions.addLabel")}
          hint={t("settings.browser.sitePermissions.addHint")}
          error={permissions.error?.message ?? save.error?.message}
        >
          <AdaptiveTextInput
            ref={originInput}
            accessibilityLabel={t("settings.browser.sitePermissions.originPlaceholder")}
            placeholder={t("settings.browser.sitePermissions.originPlaceholder")}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setOrigin}
          />
        </SettingsRow>
        <SettingsSelect<BrowserSitePermissionName>
          label={t("settings.browser.sitePermissions.permission")}
          value={permission}
          options={PERMISSIONS.map((name) => ({ value: name, label: permissionLabel(name) }))}
          onValueChange={setPermission}
        />
        <SettingsRow label="">
          <Button variant="outline" size="sm" onPress={allowException}>
            {t("settings.browser.sitePermissions.allow")}
          </Button>
          <Button variant="outline" size="sm" onPress={blockException}>
            {t("settings.browser.sitePermissions.block")}
          </Button>
        </SettingsRow>
        {(current?.sites ?? []).map((site, index) => (
          <SiteExceptionRow
            key={`${site.origin}:${site.permission}`}
            index={index}
            origin={site.origin}
            hint={`${permissionLabel(site.permission)}: ${t(`settings.browser.sitePermissions.${site.setting}`)}`}
            onRemove={removeException}
          />
        ))}
      </SettingsCard>
    </SettingsSection>
  );
}

function PermissionDefaultRow({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: BrowserSitePermissionName;
  label: string;
  value: BrowserSitePermissionSetting;
  options: { value: BrowserSitePermissionSetting; label: string }[];
  onChange: (name: BrowserSitePermissionName, setting: BrowserSitePermissionSetting) => void;
}) {
  const handleChange = useCallback(
    (setting: BrowserSitePermissionSetting) => onChange(name, setting),
    [name, onChange],
  );
  return (
    <SettingsSelect<BrowserSitePermissionSetting>
      label={label}
      value={value}
      options={options}
      onValueChange={handleChange}
    />
  );
}

function SiteExceptionRow({
  index,
  origin,
  hint,
  onRemove,
}: {
  index: number;
  origin: string;
  hint: string;
  onRemove: (index: number) => void;
}) {
  const { t } = useTranslation();
  const handleRemove = useCallback(() => onRemove(index), [index, onRemove]);
  return (
    <SettingsRow label={origin} hint={hint}>
      <Button variant="ghost" size="sm" onPress={handleRemove}>
        {t("settings.browser.downloads.remove")}
      </Button>
    </SettingsRow>
  );
}
