import React, { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { StyleSheet } from "react-native-unistyles";
import { MOTION } from "@/styles/theme";

interface AnimatedDisclosureProps {
  open: boolean;
  children: ReactNode;
}

const DISCLOSURE_EASING = Easing.bezier(...MOTION.easing.drawer);

export function AnimatedDisclosure({ open, children }: AnimatedDisclosureProps) {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const lastChildren = useRef<ReactNode>(children);
  const lastOpen = useRef(open);
  const progress = useSharedValue(open ? 1 : 0);
  const naturalHeight = useSharedValue(0);
  const animating = useSharedValue(false);

  if (open) {
    lastChildren.current = children;
  }

  useEffect(() => {
    if (lastOpen.current === open) {
      return;
    }
    lastOpen.current = open;
    if (open) {
      setMounted(true);
    }
    if (reduceMotion) {
      progress.value = open ? 1 : 0;
      animating.value = false;
      if (!open) {
        setMounted(false);
      }
      return;
    }
    animating.value = true;
    progress.value = withTiming(
      open ? 1 : 0,
      { duration: MOTION.duration.disclosure, easing: DISCLOSURE_EASING },
      (finished) => {
        if (!finished) {
          return;
        }
        animating.value = false;
        if (!open) {
          scheduleOnRN(setMounted, false);
        }
      },
    );
  }, [animating, open, progress, reduceMotion]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      naturalHeight.value = event.nativeEvent.layout.height;
    },
    [naturalHeight],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    height: animating.value ? progress.value * naturalHeight.value : "auto",
  }));

  if (!mounted) {
    return null;
  }

  return (
    <Animated.View style={[styles.clip, animatedStyle]}>
      <View onLayout={handleLayout}>{lastChildren.current}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create(() => ({
  clip: {
    overflow: "hidden",
    alignSelf: "stretch",
    minWidth: 0,
  },
}));
