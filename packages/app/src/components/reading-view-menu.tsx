import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { iconButtonChromeStyle } from "@/components/ui/icon-button-chrome";
import { Switch } from "@/components/ui/switch";
import { useIsCompactFormFactor } from "@/constants/layout";
import { READING_PRESETS, useSettings, type ReadingPreset } from "@/hooks/use-settings";

export function useReadingView() {
  const { settings, updateSettings } = useSettings();
  const setPreset = useCallback(
    (readingPreset: ReadingPreset) => void updateSettings({ readingPreset }),
    [updateSettings],
  );
  const setAnswersOnly = useCallback(
    (answersOnly: boolean) => void updateSettings({ answersOnly }),
    [updateSettings],
  );
  return {
    preset: settings.readingPreset,
    answersOnly: settings.answersOnly,
    setPreset,
    setAnswersOnly,
  };
}

interface PresetButtonProps {
  preset: ReadingPreset;
  selected: boolean;
  size: "sm" | "md";
  onChange: (preset: ReadingPreset) => void;
}

function PresetButton({ preset, selected, size, onChange }: PresetButtonProps) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onChange(preset), [onChange, preset]);
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  return (
    <Button
      testID={`reading-preset-${preset}`}
      size={size}
      variant={selected ? "secondary" : "ghost"}
      style={styles.presetButton}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={handlePress}
    >
      {t(`reading.presets.${preset}`)}
    </Button>
  );
}

export function ReadingPresetButtons({
  value,
  onChange,
  size = "sm",
}: {
  value: ReadingPreset;
  onChange: (preset: ReadingPreset) => void;
  size?: "sm" | "md";
}) {
  return (
    <View style={styles.presetRow}>
      {READING_PRESETS.map((preset) => (
        <PresetButton
          key={preset}
          preset={preset}
          selected={value === preset}
          size={size}
          onChange={onChange}
        />
      ))}
    </View>
  );
}

function readingTriggerStyle({
  hovered,
  pressed,
  open,
}: {
  hovered: boolean;
  pressed: boolean;
  open: boolean;
}) {
  return iconButtonChromeStyle({ size: "large", state: { hovered, pressed, open } });
}

export function ReadingViewMenu() {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const { preset, answersOnly, setPreset, setAnswersOnly } = useReadingView();
  const handleToggle = useCallback(
    () => setAnswersOnly(!answersOnly),
    [answersOnly, setAnswersOnly],
  );
  const trailing = useMemo(
    () => (
      <Switch
        testID="reading-answers-only-switch"
        value={answersOnly}
        onValueChange={setAnswersOnly}
        accessibilityLabel={t("reading.answersOnly.label")}
      />
    ),
    [answersOnly, setAnswersOnly, t],
  );

  return (
    <DropdownMenu compactMode="sheet">
      <DropdownMenuTrigger
        testID="reading-view-trigger"
        style={readingTriggerStyle}
        accessibilityRole="button"
        accessibilityLabel={t("reading.title")}
      >
        <Text style={styles.glyph}>Aa</Text>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="end"
        width={300}
        testID="reading-view-menu"
        sheetTitle={t("reading.title")}
      >
        <View style={styles.presetWrapper}>
          <ReadingPresetButtons
            value={preset}
            onChange={setPreset}
            size={isCompact ? "md" : "sm"}
          />
        </View>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          testID="reading-answers-only"
          description={t("reading.answersOnly.hint")}
          trailing={trailing}
          closeOnSelect={false}
          onSelect={handleToggle}
        >
          {t("reading.answersOnly.label")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const styles = StyleSheet.create((theme) => ({
  glyph: {
    fontFamily: theme.fontFamily.display,
    fontSize: theme.fontSize.xl,
    color: theme.colors.foregroundMuted,
  },
  presetWrapper: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  presetRow: {
    flexDirection: "row",
    gap: theme.spacing[1],
  },
  presetButton: {
    flex: 1,
  },
}));
