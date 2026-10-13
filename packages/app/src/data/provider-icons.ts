import type { ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import type { ProviderIdentityColor } from "@getpaseo/protocol/provider-config";
import { createStore } from "zustand/vanilla";

export interface ProviderSnapshotIcon {
  iconSvg?: string;
  iconProvider?: string;
  color?: ProviderIdentityColor;
}

export const providerSnapshotIcons = createStore<
  ReadonlyMap<string, ReadonlyMap<string, ProviderSnapshotIcon>>
>(() => new Map());

export function replaceProviderSnapshotIcons(
  serverId: string,
  entries: readonly Pick<
    ProviderSnapshotEntry,
    "provider" | "iconSvg" | "iconProvider" | "color"
  >[],
): void {
  const icons = new Map<string, ProviderSnapshotIcon>();
  for (const { provider, iconSvg, iconProvider, color } of entries) {
    if (iconSvg || iconProvider || color) {
      icons.set(provider, {
        ...(iconSvg ? { iconSvg } : {}),
        ...(iconProvider ? { iconProvider } : {}),
        ...(color ? { color } : {}),
      });
    }
  }
  providerSnapshotIcons.setState((previous) => new Map(previous).set(serverId, icons), true);
}
