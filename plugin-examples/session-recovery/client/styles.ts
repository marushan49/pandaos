import type { PluginScreenProps } from "@getpaseo/plugin/client";

export type Colors = PluginScreenProps["theme"]["colors"];

export function createStyles(colors: Colors, compact: boolean) {
  const iconButton = {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: colors.surface2,
  };
  const stateText = { flex: 1, minWidth: 0 };
  const caseRow = { paddingVertical: 16, gap: 10, minWidth: 0 };
  return {
    screen: { flex: 1, backgroundColor: colors.surface0 },
    content: { padding: compact ? 16 : 24, paddingBottom: 48 },
    column: { width: "100%" as const, maxWidth: 720, alignSelf: "center" as const, gap: 24 },
    status: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12, minWidth: 0 },
    statusBadge: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: colors.surface1,
      borderWidth: 1,
      borderColor: colors.border,
      flexShrink: 0,
    },
    statusText: { flex: 1, minWidth: 0, gap: 2 },
    statusTitle: { color: colors.foreground, fontSize: 18, fontWeight: "500" as const },
    muted: { color: colors.foregroundMuted },
    text: { color: colors.foreground },
    error: { color: colors.statusDanger },
    success: { color: colors.statusSuccess },
    iconButton,
    iconButtonPressed: { ...iconButton, backgroundColor: colors.border },
    iconButtonDisabled: { ...iconButton, opacity: 0.45 },
    caseFirst: caseRow,
    caseNext: { ...caseRow, borderTopWidth: 1, borderTopColor: colors.border },
    caseHead: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12 },
    caseTitleBlock: { flex: 1, minWidth: 0, gap: 2 },
    caseTitle: { color: colors.foreground, fontWeight: "500" as const, minWidth: 0 },
    caseActions: { flexDirection: "row" as const, gap: 8, flexShrink: 0 },
    stateLine: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      minWidth: 0,
    },
    stateWarning: { ...stateText, color: colors.statusWarning },
    stateMuted: { ...stateText, color: colors.foregroundMuted },
    timeline: { paddingVertical: 8 },
    event: { flexDirection: "row" as const, gap: 12, minWidth: 0 },
    rail: { width: 24, alignItems: "center" as const, flexShrink: 0 },
    dot: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: colors.surface2,
    },
    line: { flex: 1, width: 1, marginTop: 4, backgroundColor: colors.border },
    eventBody: { flex: 1, minWidth: 0, gap: 2, paddingBottom: 16 },
    eventHead: {
      flexDirection: "row" as const,
      alignItems: "baseline" as const,
      justifyContent: "space-between" as const,
      gap: 12,
    },
    eventTitleBase: { fontWeight: "500" as const, flexShrink: 1, minWidth: 0 },
    eventTitleSuccess: {
      fontWeight: "500" as const,
      flexShrink: 1,
      minWidth: 0,
      color: colors.statusSuccess,
    },
    eventTitleDanger: {
      fontWeight: "500" as const,
      flexShrink: 1,
      minWidth: 0,
      color: colors.statusDanger,
    },
    eventTitleWarning: {
      fontWeight: "500" as const,
      flexShrink: 1,
      minWidth: 0,
      color: colors.statusWarning,
    },
    eventTitleMuted: {
      fontWeight: "500" as const,
      flexShrink: 1,
      minWidth: 0,
      color: colors.foregroundMuted,
    },
    eventTime: { color: colors.foregroundMuted, flexShrink: 0 },
    more: { minHeight: 44, alignItems: "center" as const, justifyContent: "center" as const },
  };
}

export type Styles = ReturnType<typeof createStyles>;
