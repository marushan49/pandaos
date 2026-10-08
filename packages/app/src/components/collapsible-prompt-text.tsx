import { useCallback, useMemo, useState } from "react";
import { Text, View, type LayoutChangeEvent, type StyleProp, type TextStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { ChevronRight } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isWeb } from "@/constants/platform";
import { MOTION, type Theme } from "@/styles/theme";
import {
  countPromptLines,
  getPromptVisibleLines,
  mayNeedPromptCollapse,
  shouldCollapsePrompt,
} from "./user-message-collapse";

type PromptTextDataSet = React.ComponentProps<typeof Text>["dataSet"];

interface CollapsiblePromptTextProps {
  message: string;
  textStyle: StyleProp<TextStyle>;
  dataSet?: PromptTextDataSet;
}

const DISCLOSURE_EASING = Easing.bezier(...MOTION.easing.drawer);

const ThemedChevronRight = withUnistyles(ChevronRight);
const foregroundMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

function PromptToggleChevron({ progress }: { progress: SharedValue<number> }) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 90}deg` }],
  }));
  return (
    <Animated.View style={animatedStyle}>
      <ThemedChevronRight size={14} uniProps={foregroundMutedMapping} />
    </Animated.View>
  );
}

function MeasuredPromptText({
  message,
  textStyle,
  dataSet,
  visibleLines,
}: CollapsiblePromptTextProps & { visibleLines: number }) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [fullHeight, setFullHeight] = useState(0);
  const [clampedHeight, setClampedHeight] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(true);
  const progress = useSharedValue(0);
  const animating = useSharedValue(false);
  const fullHeightValue = useSharedValue(0);
  const clampedHeightValue = useSharedValue(0);

  const totalLines = countPromptLines({ fullHeight, clampedHeight, visibleLines });
  const collapsible = shouldCollapsePrompt(totalLines, visibleLines);
  const showClamp = clamped && (collapsible || totalLines === 0);

  const handleMeasurerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const height = event.nativeEvent.layout.height;
      fullHeightValue.value = height;
      setFullHeight(height);
    },
    [fullHeightValue],
  );

  const handleTextLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (!showClamp) {
        return;
      }
      const height = event.nativeEvent.layout.height;
      clampedHeightValue.value = height;
      setClampedHeight(height);
    },
    [clampedHeightValue, showClamp],
  );

  const handleToggle = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (next) {
      setClamped(false);
    }
    if (reduceMotion) {
      progress.value = next ? 1 : 0;
      animating.value = false;
      if (!next) {
        setClamped(true);
      }
      return;
    }
    animating.value = true;
    progress.value = withTiming(
      next ? 1 : 0,
      { duration: MOTION.duration.disclosure, easing: DISCLOSURE_EASING },
      (finished) => {
        if (!finished) {
          return;
        }
        animating.value = false;
        if (!next) {
          scheduleOnRN(setClamped, true);
        }
      },
    );
  }, [animating, expanded, progress, reduceMotion]);

  const clipStyle = useAnimatedStyle(() => ({
    height: animating.value
      ? clampedHeightValue.value +
        progress.value * (fullHeightValue.value - clampedHeightValue.value)
      : "auto",
  }));
  const animatedClipStyle = useMemo(() => [styles.clip, clipStyle], [clipStyle]);
  const measurerStyle = useMemo(() => [textStyle, styles.measurer], [textStyle]);
  const chevron = useMemo(() => <PromptToggleChevron progress={progress} />, [progress]);

  return (
    <View>
      <Animated.View style={animatedClipStyle}>
        <Text
          selectable
          style={textStyle}
          dataSet={dataSet}
          numberOfLines={showClamp ? visibleLines : undefined}
          onLayout={handleTextLayout}
        >
          {message}
        </Text>
      </Animated.View>
      <Text aria-hidden style={measurerStyle} onLayout={handleMeasurerLayout}>
        {message}
      </Text>
      {collapsible ? (
        <Button
          variant="ghost"
          size="sm"
          style={styles.toggle}
          onPress={handleToggle}
          aria-expanded={expanded}
          trailing={chevron}
          testID="user-message-prompt-toggle"
        >
          {expanded
            ? t("message.prompt.collapse")
            : t("message.prompt.showFull", { count: totalLines })}
        </Button>
      ) : null}
    </View>
  );
}

export function CollapsiblePromptText({ message, textStyle, dataSet }: CollapsiblePromptTextProps) {
  const isCompact = useIsCompactFormFactor();
  const visibleLines = getPromptVisibleLines(isCompact);
  if (!mayNeedPromptCollapse(message, visibleLines)) {
    return (
      <Text selectable style={textStyle} dataSet={dataSet}>
        {message}
      </Text>
    );
  }
  return (
    <MeasuredPromptText
      key={visibleLines}
      message={message}
      textStyle={textStyle}
      dataSet={dataSet}
      visibleLines={visibleLines}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  clip: {
    overflow: "hidden",
  },
  measurer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
    pointerEvents: "none",
    ...(isWeb ? { userSelect: "none" as const } : {}),
  },
  toggle: {
    alignSelf: "flex-start",
    marginLeft: -(theme.spacing[3] + theme.borderWidth[1]),
    marginTop: theme.spacing[1],
    minHeight: theme.spacing[8] + theme.spacing[2],
  },
}));
