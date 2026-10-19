import { useCallback } from "react";
import { router, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { withUnistyles } from "react-native-unistyles";
import {
  Import as ImportIcon,
  MoreHorizontal,
  Search,
  Settings,
  ZoomIn,
  ZoomOut,
} from "@/components/icons/ui-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { extraMutedIconColorMapping } from "@/components/ui/icon-button-chrome";
import { ToolbarButton, paneContentToolbarIconSize } from "@/components/ui/pane-content-toolbar";
import type { Theme } from "@/styles/theme";
import { buildSettingsHostSectionRoute } from "@/utils/host-routes";

const ThemedMoreHorizontal = withUnistyles(MoreHorizontal);
const ThemedSearch = withUnistyles(Search);
const ThemedZoomIn = withUnistyles(ZoomIn);
const ThemedZoomOut = withUnistyles(ZoomOut);
const ThemedImport = withUnistyles(ImportIcon);
const ThemedSettings = withUnistyles(Settings);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const FIND_ICON = <ThemedSearch size={16} uniProps={mutedColorMapping} />;
const ZOOM_IN_ICON = <ThemedZoomIn size={16} uniProps={mutedColorMapping} />;
const ZOOM_OUT_ICON = <ThemedZoomOut size={16} uniProps={mutedColorMapping} />;
const IMPORT_ICON = <ThemedImport size={16} uniProps={mutedColorMapping} />;
const SETTINGS_ICON = <ThemedSettings size={16} uniProps={mutedColorMapping} />;

export const BROWSER_ZOOM_LEVELS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

export function stepBrowserZoom(zoom: number, direction: 1 | -1): number {
  const index = BROWSER_ZOOM_LEVELS.indexOf(zoom);
  const next = BROWSER_ZOOM_LEVELS[(index < 0 ? 5 : index) + direction];
  return next ?? zoom;
}

export function BrowserMenu({
  serverId,
  compact,
  zoom,
  onZoomChange,
  onFind,
}: {
  serverId: string;
  compact: boolean;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onFind: () => void;
}) {
  const { t } = useTranslation();
  const openSettings = useCallback(() => {
    router.push(buildSettingsHostSectionRoute(serverId, "browser") as Href);
  }, [serverId]);
  const percent = `${Math.round(zoom * 100)}%`;
  const zoomOut = useCallback(() => onZoomChange(stepBrowserZoom(zoom, -1)), [onZoomChange, zoom]);
  const zoomIn = useCallback(() => onZoomChange(stepBrowserZoom(zoom, 1)), [onZoomChange, zoom]);
  const zoomReset = useCallback(() => onZoomChange(1), [onZoomChange]);

  return (
    <DropdownMenu compactMode="sheet">
      <ToolbarButton
        kind="menu"
        label={t("workspace.browser.menu.label")}
        compact={compact}
        testID="remote-browser-menu"
      >
        <ThemedMoreHorizontal
          size={paneContentToolbarIconSize(compact)}
          uniProps={extraMutedIconColorMapping}
        />
      </ToolbarButton>
      <DropdownMenuContent
        align="end"
        width={260}
        sheetTitle={t("workspace.browser.menu.label")}
        testID="remote-browser-menu-content"
      >
        <DropdownMenuItem leading={FIND_ICON} onSelect={onFind} testID="remote-browser-menu-find">
          {t("workspace.browser.menu.find")}
        </DropdownMenuItem>
        <DropdownMenuItem
          leading={ZOOM_OUT_ICON}
          closeOnSelect={false}
          disabled={zoom <= BROWSER_ZOOM_LEVELS[0]}
          onSelect={zoomOut}
          testID="remote-browser-menu-zoom-out"
        >
          {t("workspace.browser.menu.zoomOut")}
        </DropdownMenuItem>
        <DropdownMenuItem
          leading={ZOOM_IN_ICON}
          closeOnSelect={false}
          disabled={zoom >= BROWSER_ZOOM_LEVELS[BROWSER_ZOOM_LEVELS.length - 1]}
          onSelect={zoomIn}
          testID="remote-browser-menu-zoom-in"
        >
          {t("workspace.browser.menu.zoomIn")}
        </DropdownMenuItem>
        <DropdownMenuItem
          closeOnSelect={false}
          disabled={zoom === 1}
          description={percent}
          onSelect={zoomReset}
          testID="remote-browser-menu-zoom-reset"
        >
          {t("workspace.browser.menu.zoomReset")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          leading={IMPORT_ICON}
          onSelect={openSettings}
          testID="remote-browser-menu-import"
        >
          {t("workspace.browser.menu.import")}
        </DropdownMenuItem>
        <DropdownMenuItem
          leading={SETTINGS_ICON}
          onSelect={openSettings}
          testID="remote-browser-menu-settings"
        >
          {t("workspace.browser.menu.settings")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
