import {
  openExternalUrl,
  useSettings,
  type PluginButtonContentProps,
} from "@getpaseo/plugin/client";
import { copyText, Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { pinsSettings, type Pin } from "../shared/pins";

export function createPinsPopover(remove: (id: string) => Promise<void>) {
  return function PinsPopover({ theme, workspaceId, close }: PluginButtonContentProps) {
    const settings = useSettings(pinsSettings);
    const toast = useToast();
    const pins =
      settings.status === "ready"
        ? settings.values.pins.filter((pin) => pin.workspaceId === workspaceId)
        : [];
    const styles = useMemo(
      () => ({
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
      }),
      [theme],
    );

    async function activate(pin: Pin) {
      if (pin.url) {
        close();
        await openExternalUrl(pin.url);
        return;
      }
      await copyText(pin.text);
      toast.show("Kopiert", { variant: "success" });
    }

    if (pins.length === 0) return <Text style={styles.empty}>Keine Pins in diesem Workspace.</Text>;

    return (
      <View style={styles.list}>
        {pins.map((pin) => (
          <View key={pin.id} style={styles.row}>
            <Pressable
              accessibilityRole={pin.url ? "link" : "button"}
              accessibilityLabel={pin.url ? `${pin.text} öffnen` : `${pin.text} kopieren`}
              style={styles.main}
              onPress={() => void activate(pin)}
            >
              <Icon
                name={pin.url ? "ExternalLink" : "Copy"}
                size={14}
                color={theme.colors.foregroundMuted}
              />
              <Text style={pin.url ? styles.link : styles.text} numberOfLines={2}>
                {pin.text}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${pin.text} lösen`}
              hitSlop={6}
              style={styles.unpin}
              onPress={() => void remove(pin.id).catch(() => toast.error("Lösen fehlgeschlagen"))}
            >
              <Icon name="PinOff" size={14} color={theme.colors.foregroundMuted} />
            </Pressable>
          </View>
        ))}
      </View>
    );
  };
}
