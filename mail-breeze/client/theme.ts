import type { PluginTheme } from "@getpaseo/plugin";
import type { Task } from "../shared/contracts";

export type TaskStatus = Task["status"];

export const BREEZE = {
  sage: "#7fb89a",
  mint: "#8fdcc0",
  sky: "#8cc7ee",
  sun: "#f2c879",
} as const;

export const alpha = (hex: string, opacity: number) =>
  `${hex}${Math.round(opacity * 255)
    .toString(16)
    .padStart(2, "0")}`;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

export interface StatusLook {
  label: string;
  icon: string;
  color: string;
  tint: string;
}

export function statusLook(theme: PluginTheme, status: TaskStatus): StatusLook {
  const c = theme.colors;
  switch (status) {
    case "ready":
      return { label: "Bereit", icon: "Inbox", color: c.foreground, tint: alpha(BREEZE.sky, 0.2) };
    case "working":
      return {
        label: "In Arbeit",
        icon: "Wind",
        color: c.statusSuccess,
        tint: alpha(BREEZE.mint, 0.22),
      };
    case "done":
      return {
        label: "Erledigt",
        icon: "CheckCheck",
        color: c.statusSuccess,
        tint: alpha(BREEZE.sage, 0.22),
      };
    case "needs_input":
      return {
        label: "Braucht dich",
        icon: "MessageCircleQuestion",
        color: c.statusWarning,
        tint: alpha(BREEZE.sun, 0.24),
      };
    case "failed":
      return {
        label: "Fehlgeschlagen",
        icon: "TriangleAlert",
        color: c.statusDanger,
        tint: alpha(c.statusDanger, 0.14),
      };
    case "dismissed":
      return {
        label: "Verworfen",
        icon: "EyeOff",
        color: c.foregroundMuted,
        tint: alpha(c.foregroundMuted, 0.12),
      };
  }
}

export const STATUS_ORDER: readonly TaskStatus[] = [
  "needs_input",
  "ready",
  "working",
  "failed",
  "done",
  "dismissed",
];
