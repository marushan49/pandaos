import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, View, type ViewStyle } from "react-native";
import { BREEZE_PANDA_URI } from "../shared/panda-image";

const SOURCE = { uri: BREEZE_PANDA_URI };
const HALF_CYCLE_MS = 2600;

function sway(lift: Animated.Value, toValue: number) {
  return Animated.timing(lift, {
    toValue,
    duration: HALF_CYCLE_MS,
    easing: Easing.inOut(Easing.sin),
    useNativeDriver: true,
  });
}

export function Panda({ size = 72, label = "Panda-Begleiter" }: { size?: number; label?: string }) {
  const lift = useRef(new Animated.Value(0)).current;
  const [still, setStill] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (alive) setStill(reduced);
        return reduced;
      })
      .catch(() => false);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (still) {
      lift.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(Animated.sequence([sway(lift, 1), sway(lift, 0)]));
    loop.start();
    return () => loop.stop();
  }, [lift, still]);

  const wrap = useMemo<ViewStyle>(
    () => ({ width: size, height: size, alignItems: "center", justifyContent: "center" }),
    [size],
  );
  const image = useMemo(() => ({ width: size, height: size }), [size]);
  const motion = useMemo(
    () => ({
      transform: [
        { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.06] }) },
        { rotate: lift.interpolate({ inputRange: [0, 1], outputRange: ["-2deg", "2deg"] }) },
      ],
    }),
    [lift, size],
  );

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={wrap}>
      <Animated.View style={motion}>
        <Image
          source={SOURCE}
          style={image}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </Animated.View>
    </View>
  );
}
