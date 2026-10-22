import {
  openExternalUrl,
  useSettings,
  type PluginButtonContentProps,
} from "@getpaseo/plugin/client";
import { copyText, Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useCallback, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { pinsSettings, type Pin } from "../shared/pins";

interface PinRowProps {
  pin: Pin;
  styles: ReturnType<typeof createStyles>;
  iconColor: string;
  onActivate: (pin: Pin) => Promise<void>;
  onRemove: (pin: Pin) => Promise<void>;
}

function createStyles(theme: PluginButtonContentProps["theme"]) {
  return {
    list: { gap: 2, minWidth: 260, maxWidth: 420 },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      paddingVertical: 6,
    },
    main: {
      flex: 1,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      minWidth: 0,
    },
    text: { flex: 1, color: theme.colors.foreground },
    link: { flex: 1, color: theme.colors.accent, textDecorationLine: "underline" as const },
    unpin: { padding: 4, borderRadius: 6 },
    empty: { color: theme.colors.foregroundMuted },
  };
}

function PinRow({ pin, styles, iconColor, onActivate, onRemove }: PinRowProps) {
  const activate = useCallback(() => void onActivate(pin), [onActivate, pin]);
  const remove = useCallback(() => void onRemove(pin), [onRemove, pin]);
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole={pin.url ? "link" : "button"}
        accessibilityLabel={pin.url ? `${pin.text} öffnen` : `${pin.text} kopieren`}
        style={styles.main}
        onPress={activate}
      >
        <Icon name={pin.url ? "ExternalLink" : "Copy"} size={14} color={iconColor} />
        <Text style={pin.url ? styles.link : styles.text} numberOfLines={2}>
          {pin.text}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${pin.text} lösen`}
        hitSlop={6}
        style={styles.unpin}
        onPress={remove}
      >
        <Icon name="PinOff" size={14} color={iconColor} />
      </Pressable>
    </View>
  );
}

export function createPinsPopover(remove: (id: string) => Promise<void>) {
  return function PinsPopover({ theme, workspaceId, close }: PluginButtonContentProps) {
    const settings = useSettings(pinsSettings);
    const toast = useToast();
    const pins =
      settings.status === "ready"
        ? settings.values.pins.filter((pin) => pin.workspaceId === workspaceId)
        : [];
    const styles = useMemo(() => createStyles(theme), [theme]);

    const activate = useCallback(
      async (pin: Pin) => {
        if (pin.url) {
          close();
          await openExternalUrl(pin.url);
          return;
        }
        await copyText(pin.text);
        toast.show("Kopiert", { variant: "success" });
      },
      [close, toast],
    );

    const unpin = useCallback(
      (pin: Pin) =>
        remove(pin.id).catch(() => {
          toast.error("Lösen fehlgeschlagen");
        }),
      [toast],
    );

    if (pins.length === 0) return <Text style={styles.empty}>Keine Pins in diesem Workspace.</Text>;

    return (
      <View style={styles.list}>
        {pins.map((pin) => (
          <PinRow
            key={pin.id}
            pin={pin}
            styles={styles}
            iconColor={theme.colors.foregroundMuted}
            onActivate={activate}
            onRemove={unpin}
          />
        ))}
      </View>
    );
  };
}
