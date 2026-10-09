import { Icon } from "@getpaseo/plugin/client/react-native";
import { useCallback, useMemo } from "react";
import { Pressable } from "react-native";
import type { Styles } from "./styles";

export function IconButton({
  icon,
  label,
  color,
  disabled,
  styles,
  onPress,
}: {
  icon: string;
  label: string;
  color: string;
  disabled?: boolean;
  styles: Styles;
  onPress(): void;
}) {
  const style = useCallback(
    ({ pressed }: { pressed: boolean }) => {
      if (disabled) return styles.iconButtonDisabled;
      return pressed ? styles.iconButtonPressed : styles.iconButton;
    },
    [disabled, styles],
  );
  const state = useMemo(() => ({ disabled: Boolean(disabled) }), [disabled]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={state}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={style}
    >
      <Icon name={icon} size={18} color={color} />
    </Pressable>
  );
}
