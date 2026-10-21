import { useMemo } from "react";
import type { Theme } from "./controls.tsx";
import type { Alert } from "../shared/model.ts";

export function directionColor(theme: Theme, direction: Alert["direction"]) {
  if (direction === "positive") return theme.colors.statusSuccess;
  if (direction === "negative") return theme.colors.statusDanger;
  return theme.colors.foregroundMuted;
}

export function useStyles(theme: Theme, compact: boolean) {
  return useMemo(() => {
    const c = theme.colors;
    return {
      theme,
      compact,
      screen: { flex: 1, backgroundColor: c.surface0 },
      page: { flex: 1, padding: compact ? 12 : 20, gap: 14 },
      header: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
      },
      grow: { flex: 1, minWidth: 0 },
      title: { color: c.foreground, fontSize: compact ? 20 : 24, fontWeight: "700" as const },
      strong: { color: c.foreground, fontSize: 15, fontWeight: "600" as const },
      text: { color: c.foreground, fontSize: 14, lineHeight: 20 },
      lead: { color: c.foreground, fontSize: 17, lineHeight: 24, fontWeight: "600" as const },
      muted: { color: c.foregroundMuted, fontSize: 13, lineHeight: 18 },
      danger: { color: c.statusDanger, fontSize: 13, lineHeight: 18 },
      bar: { flexGrow: 0 },
      barContent: { gap: 8, paddingVertical: 2 },
      body: { flex: 1, flexDirection: "row" as const, gap: 16, minHeight: 0 },
      list: { flex: compact ? 1 : 0.9, minWidth: 0 },
      listContent: { gap: 10, paddingBottom: 24 },
      detail: {
        flex: compact ? 1 : 1.3,
        minWidth: 0,
        borderRadius: 12,
        borderWidth: compact ? 0 : 1,
        borderColor: c.border,
        backgroundColor: compact ? c.surface0 : c.surface1,
      },
      detailContent: { padding: compact ? 4 : 20, gap: 16, paddingBottom: 32 },
      section: { gap: 6 },
      label: {
        color: c.foregroundMuted,
        fontSize: 12,
        fontWeight: "600" as const,
        letterSpacing: 0.5,
        textTransform: "uppercase" as const,
      },
      row: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
      wrap: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
      badge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: c.border,
        flexShrink: 0,
      },
      badgeText: { color: c.foreground, fontSize: 12, fontWeight: "600" as const },
      dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
      input: {
        flex: 1,
        minWidth: 0,
        minHeight: 44,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface0,
        color: c.foreground,
        fontSize: 15,
      },
      bubbleUser: {
        padding: 10,
        borderRadius: 10,
        backgroundColor: c.surface2,
        alignSelf: "flex-end" as const,
      },
      bubbleAnswer: { padding: 10, borderRadius: 10, backgroundColor: c.surface0 },
      bars: { flexDirection: "row" as const, alignItems: "flex-end" as const, gap: 4, height: 48 },
      relatedItem: { paddingVertical: 6 },
      textGrow: { flex: 1, minWidth: 0, color: c.foreground, fontSize: 14, lineHeight: 20 },
      labelGrow: {
        flex: 1,
        minWidth: 0,
        color: c.foregroundMuted,
        fontSize: 12,
        fontWeight: "600" as const,
        letterSpacing: 0.5,
        textTransform: "uppercase" as const,
      },
      link: {
        color: c.foreground,
        fontSize: 14,
        lineHeight: 20,
        textDecorationLine: "underline" as const,
      },
      narrow: { width: 120 },
      settings: { gap: 20, paddingBottom: 16 },
      empty: { padding: 24, gap: 8, alignItems: "center" as const },
      drop: {
        padding: 20,
        borderRadius: 12,
        borderWidth: 2,
        borderStyle: "dashed" as const,
        borderColor: c.border,
        alignItems: "center" as const,
        gap: 6,
      },
      field: { gap: 6 },
    };
  }, [theme, compact]);
}

export type Styles = ReturnType<typeof useStyles>;

export function time(value: string) {
  return new Date(value).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function delay(alert: Alert) {
  const minutes = Math.max(
    0,
    Math.round((Date.parse(alert.receivedAt) - Date.parse(alert.publishedAt)) / 60_000),
  );
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / 1440)} Tage`;
}
