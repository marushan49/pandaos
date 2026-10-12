import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "../icons";

const rowStyle = { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 };
const buttonStyle = { padding: 10 };

export function MediaControls({
  zoom,
  setZoom,
  foreground,
}: {
  zoom: number;
  setZoom: Dispatch<SetStateAction<number>>;
  foreground: string;
}) {
  const out = useCallback(() => setZoom((value) => Math.max(1, value - 0.5)), [setZoom]);
  const reset = useCallback(() => setZoom(1), [setZoom]);
  const into = useCallback(() => setZoom((value) => Math.min(4, value + 0.5)), [setZoom]);
  const textStyle = useMemo(() => ({ color: foreground }), [foreground]);
  return (
    <View style={rowStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Zoom out"
        disabled={zoom <= 1}
        onPress={out}
        style={buttonStyle}
      >
        <Icon name="Minus" color={foreground} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reset image zoom"
        onPress={reset}
        style={buttonStyle}
      >
        <Text style={textStyle}>{Math.round(zoom * 100)}%</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Zoom in"
        disabled={zoom >= 4}
        onPress={into}
        style={buttonStyle}
      >
        <Icon name="Plus" color={foreground} />
      </Pressable>
    </View>
  );
}
