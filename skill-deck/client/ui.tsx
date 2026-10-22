import type { PluginHostProps } from "@getpaseo/plugin/client";
import { Icon, TextInput } from "@getpaseo/plugin/client/react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PressableStateCallbackType, TextStyle, ViewStyle } from "react-native";

export type Theme = PluginHostProps["theme"];

export function useDeckStyles(theme: Theme, compact: boolean) {
  const c = theme.colors;
  return useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, minHeight: 0, backgroundColor: c.surface0 },
        page: { flex: 1, minHeight: 0, padding: compact ? 12 : 24, gap: 16 },
        row: { flexDirection: "row", alignItems: "center", gap: 10 },
        wrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
        column: { gap: 12 },
        grow: { flex: 1, minWidth: 0, minHeight: 0 },
        headerLabel: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
        title: {
          color: c.foreground,
          fontSize: compact ? 24 : 32,
          fontWeight: "800",
          letterSpacing: -0.8,
        },
        heading: { color: c.foreground, fontSize: 19, fontWeight: "700" },
        strong: { color: c.foreground, fontSize: 15, fontWeight: "600" },
        text: { color: c.foreground, fontSize: 15, lineHeight: 23 },
        muted: { color: c.foregroundMuted, fontSize: 13, lineHeight: 20 },
        error: { color: c.foreground, fontSize: 14, lineHeight: 22 },
        slot: {
          width: 42,
          minHeight: 42,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: c.surface2,
          borderBottomWidth: 3,
          borderColor: c.foregroundMuted,
        },
        slotText: {
          color: c.foreground,
          fontSize: 13,
          fontWeight: "800",
          fontVariant: ["tabular-nums"],
        },
        body: { flex: 1, minHeight: 0, flexDirection: "row", gap: 20 },
        list: { flex: 1, minWidth: 0 },
        listContent: { gap: 8, paddingBottom: 24 },
        detail: {
          flex: compact ? 1 : 1.15,
          minWidth: 0,
          backgroundColor: c.surface1,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 2,
        },
        detailContent: { padding: compact ? 16 : 24, gap: 22, paddingBottom: 36 },
        divider: { borderBottomWidth: 1, borderColor: c.border, paddingBottom: 14 },
        evidence: { padding: 14, backgroundColor: c.surface2, gap: 10 },
        empty: { padding: 24, gap: 12, alignItems: "flex-start" },
        track: { height: 8, backgroundColor: c.surface2, flex: 1 },
        warning: { borderWidth: 1, borderColor: c.foregroundMuted, padding: 12, gap: 6 },
        tabRail: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 6,
          borderBottomWidth: 2,
          borderColor: c.border,
          paddingBottom: 12,
        },
        footer: { color: c.foregroundMuted, fontSize: 12, lineHeight: 18 },
        cartridge: {
          padding: 16,
          borderBottomWidth: 3,
          borderColor: c.foregroundMuted,
          backgroundColor: c.surface1,
          gap: 12,
        },
      }),
    [c, compact],
  );
}
export type DeckStyles = ReturnType<typeof useDeckStyles>;

export function DeckButton({
  theme,
  label,
  icon,
  showLabel = true,
  selected = false,
  disabled = false,
  onPress,
}: {
  theme: Theme;
  label: string;
  icon?: string;
  showLabel?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onPress(): void;
}) {
  const [focused, setFocused] = useState(false);
  const c = theme.colors;
  const focus = useCallback(() => setFocused(true), []);
  const blur = useCallback(() => setFocused(false), []);
  const accessibilityState = useMemo(() => ({ selected, disabled }), [selected, disabled]);
  const buttonStyle = useCallback(
    ({ pressed }: PressableStateCallbackType): ViewStyle => {
      let borderColor = selected ? c.accent : c.border;
      if (focused) borderColor = c.foreground;
      let backgroundColor = pressed ? c.surface2 : c.surface1;
      if (selected) backgroundColor = c.accent;
      return {
        minHeight: 44,
        minWidth: 44,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 2,
        borderWidth: 2,
        borderBottomWidth: 4,
        borderColor,
        backgroundColor,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: disabled ? 0.55 : 1,
      };
    },
    [c, disabled, focused, selected],
  );
  const textStyle = useMemo<TextStyle>(
    () => ({
      color: selected ? c.accentForeground : c.foreground,
      fontSize: 14,
      fontWeight: selected ? "700" : "500",
      flexShrink: 1,
    }),
    [c, selected],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`skill-deck-action-${label}`}
      nativeID={`skill-deck-action-${label.replace(/[^a-z0-9]/gi, "-")}`}
      accessibilityState={accessibilityState}
      disabled={disabled}
      onPress={onPress}
      onFocus={focus}
      onBlur={blur}
      style={buttonStyle}
    >
      {icon ? (
        <Icon name={icon} size={17} color={selected ? c.accentForeground : c.foreground} />
      ) : null}
      {showLabel ? <Text style={textStyle}>{label}</Text> : null}
    </Pressable>
  );
}

export function Search({
  theme,
  value,
  onChange,
}: {
  theme: Theme;
  value: string;
  onChange(value: string): void;
}) {
  const [focused, setFocused] = useState(false);
  const c = theme.colors;
  const focus = useCallback(() => setFocused(true), []);
  const blur = useCallback(() => setFocused(false), []);
  const containerStyle = useMemo<ViewStyle>(
    () => ({
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      gap: 10,
      borderWidth: 2,
      borderColor: focused ? c.foreground : c.border,
      backgroundColor: c.surface1,
      borderRadius: 2,
      minHeight: 48,
    }),
    [c, focused],
  );
  const inputStyle = useMemo<TextStyle>(
    () => ({
      flex: 1,
      minWidth: 0,
      minHeight: 44,
      color: c.foreground,
      fontSize: 15,
    }),
    [c.foreground],
  );
  return (
    <View style={containerStyle}>
      <Icon name="Search" size={18} color={c.foregroundMuted} />
      <TextInput
        accessibilityLabel="Module suchen"
        testID="skill-deck-search"
        nativeID="skill-deck-search"
        placeholder="Name, Thema oder Provider"
        placeholderTextColor={c.foregroundMuted}
        value={value}
        onChangeText={onChange}
        onFocus={focus}
        onBlur={blur}
        autoCapitalize="none"
        autoCorrect={false}
        style={inputStyle}
      />
    </View>
  );
}

export function Message({
  styles,
  title,
  text,
}: {
  styles: DeckStyles;
  title: string;
  text?: string;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.heading}>{title}</Text>
      {text ? <Text style={styles.muted}>{text}</Text> : null}
    </View>
  );
}

export function date(value: string | null) {
  return value
    ? new Date(value).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })
    : "Noch nicht geprüft";
}
