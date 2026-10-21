import type { PluginHostProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, type PressableStateCallbackType } from "react-native";

export type Theme = PluginHostProps["theme"];

export function Button({
  theme,
  label,
  text,
  icon,
  onPress,
  disabled = false,
  selected = false,
  primary = false,
}: {
  theme: Theme;
  label: string;
  text?: string;
  icon?: string;
  onPress(): void;
  disabled?: boolean;
  selected?: boolean;
  primary?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const focus = useCallback(() => setFocused(true), []);
  const blur = useCallback(() => setFocused(false), []);
  const state = useMemo(() => ({ disabled, selected }), [disabled, selected]);
  const color = primary ? theme.colors.accentForeground : theme.colors.foreground;
  const style = useCallback(
    ({ pressed }: PressableStateCallbackType) => {
      let background = theme.colors.surface0;
      if (primary) background = theme.colors.accent;
      else if (pressed || selected) background = theme.colors.surface2;
      let border = primary ? theme.colors.accent : theme.colors.border;
      if (focused) border = theme.colors.foreground;
      let opacity = pressed && primary ? 0.85 : 1;
      if (disabled) opacity = 0.5;
      return {
        minHeight: 44,
        minWidth: 44,
        paddingHorizontal: text ? 14 : 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: border,
        backgroundColor: background,
        opacity,
        flexDirection: "row" as const,
        gap: 6,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        flexShrink: 0,
      };
    },
    [focused, selected, primary, disabled, text, theme],
  );
  const textStyle = useMemo(
    () => ({ color, fontSize: 14, fontWeight: primary || selected ? ("600" as const) : undefined }),
    [color, primary, selected],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={state}
      disabled={disabled}
      onPress={onPress}
      onFocus={focus}
      onBlur={blur}
      style={style}
    >
      {icon ? <Icon name={icon} size={16} color={color} /> : null}
      {text ? <Text style={textStyle}>{text}</Text> : null}
    </Pressable>
  );
}

export function Choice<Value extends string>({
  theme,
  option,
  selected,
  disabled,
  onSelect,
}: {
  theme: Theme;
  option: { value: Value; label: string };
  selected: boolean;
  disabled?: boolean;
  onSelect(value: Value): void;
}) {
  const select = useCallback(() => onSelect(option.value), [onSelect, option.value]);
  return (
    <Button
      theme={theme}
      label={option.label}
      text={option.label}
      selected={selected}
      disabled={disabled}
      onPress={select}
    />
  );
}
