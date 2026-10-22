import { useMemo } from "react";
import type { PluginTheme } from "@getpaseo/plugin";
import type { TextStyle, ViewStyle } from "react-native";

export function useSurfaceStyles(theme: PluginTheme, compact = false) {
  return useMemo(
    () => ({
      stack: { gap: 16 } satisfies ViewStyle,
      group: { gap: 8 } satisfies ViewStyle,
      tight: { gap: 4 } satisfies ViewStyle,
      row: { flexDirection: "row", gap: 12, flexWrap: "wrap" } satisfies ViewStyle,
      tableRow: { flexDirection: "row" } satisfies ViewStyle,
      tableHeader: {
        flexDirection: "row",
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
      } satisfies ViewStyle,
      table: { minWidth: "100%" } satisfies ViewStyle,
      text: { color: theme.colors.foreground } satisfies TextStyle,
      muted: { color: theme.colors.foregroundMuted } satisfies TextStyle,
      title: { color: theme.colors.foreground, fontWeight: "600" } satisfies TextStyle,
      metric: {
        color: theme.colors.foreground,
        fontSize: 24,
        fontWeight: "600",
      } satisfies TextStyle,
      error: { color: theme.colors.statusDanger } satisfies TextStyle,
      cell: {
        color: theme.colors.foreground,
        flex: 1,
        minWidth: 70,
        padding: 8,
      } satisfies TextStyle,
      headerCell: {
        color: theme.colors.foreground,
        flex: 1,
        minWidth: 70,
        padding: 8,
        fontWeight: "600",
      } satisfies TextStyle,
      input: {
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface2,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: 6,
        padding: 12,
        minHeight: 44,
      } satisfies TextStyle,
      slider: { minHeight: 44, justifyContent: "center" } satisfies ViewStyle,
      track: {
        height: 6,
        backgroundColor: theme.colors.surface2,
        borderRadius: 3,
      } satisfies ViewStyle,
      chartTrack: { height: 8, backgroundColor: theme.colors.surface2 } satisfies ViewStyle,
      box: {
        padding: compact ? 12 : 16,
        gap: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        backgroundColor: theme.colors.surface1,
        minWidth: 0,
      } satisfies ViewStyle,
      page: { padding: compact ? 12 : 24 } satisfies ViewStyle,
    }),
    [theme, compact],
  );
}
