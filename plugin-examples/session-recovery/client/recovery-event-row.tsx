import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { describeEvent, firstLine, formatTime, type RecoveryEvent } from "./labels";

export function RecoveryEventRow({ item, theme, layout }: PluginTimelineItemProps<RecoveryEvent>) {
  const event = item.data;
  const { title, icon, tone } = describeEvent(event);
  const colors = theme.colors;
  const toneColor = {
    success: colors.statusSuccess,
    danger: colors.statusDanger,
    warning: colors.statusWarning,
    muted: colors.foregroundMuted,
  }[tone];
  const detail = firstLine(event.status === "failed" && event.error ? event.error : event.reason);
  const time = formatTime(event.at);
  const styles = useMemo(
    () => ({
      row: {
        flexDirection: "row" as const,
        alignItems: layout.compact ? ("flex-start" as const) : ("center" as const),
        gap: 8,
        minHeight: 32,
        paddingVertical: 4,
        minWidth: 0,
      },
      icon: { paddingTop: layout.compact ? 2 : 0 },
      body: {
        flex: 1,
        minWidth: 0,
        flexDirection: layout.compact ? ("column" as const) : ("row" as const),
        alignItems: layout.compact ? ("flex-start" as const) : ("center" as const),
        gap: layout.compact ? 2 : 8,
      },
      title: { color: toneColor, fontWeight: "500" as const, flexShrink: 0 },
      meta: { color: colors.foregroundMuted, flexShrink: 0 },
      detail: { color: colors.foregroundMuted, flexShrink: 1, minWidth: 0 },
    }),
    [colors.foregroundMuted, layout.compact, toneColor],
  );
  return (
    <View style={styles.row} accessible accessibilityLabel={`${title}, ${time}, ${detail}`}>
      <View style={styles.icon}>
        <Icon name={icon} size={14} color={toneColor} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {time ? <Text style={styles.meta}>{time}</Text> : null}
        {detail ? (
          <Text numberOfLines={layout.compact ? 2 : 1} style={styles.detail}>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
