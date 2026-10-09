import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { SettingsCard, SettingsRow, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  describeEvent,
  eventDetail,
  formatDateTime,
  formatTime,
  toneColor,
  type RecoveryEvent,
  type Tone,
} from "./labels";
import type { Colors, Styles } from "./styles";

type Navigation = PluginScreenProps["navigation"];

const HISTORY_PREVIEW = 8;

function titleStyle(styles: Styles, tone: Tone) {
  if (tone === "success") return styles.eventTitleSuccess;
  if (tone === "danger") return styles.eventTitleDanger;
  if (tone === "warning") return styles.eventTitleWarning;
  return styles.eventTitleMuted;
}

function HistoryEntry({
  event,
  last,
  styles,
  colors,
  navigation,
}: {
  event: RecoveryEvent;
  last: boolean;
  styles: Styles;
  colors: Colors;
  navigation: Navigation;
}) {
  const { title, icon, tone } = describeEvent(event);
  const name = event.title ?? event.agentId;
  const detail = eventDetail(event);
  const open = useCallback(
    () => navigation?.openAgent({ agentId: event.agentId }),
    [navigation, event.agentId],
  );
  const body = (
    <View style={styles.event}>
      <View style={styles.rail}>
        <View style={styles.dot}>
          <Icon name={icon} size={13} color={toneColor(colors, tone)} />
        </View>
        {last ? null : <View style={styles.line} />}
      </View>
      <View style={styles.eventBody}>
        <View style={styles.eventHead}>
          <Text style={titleStyle(styles, tone)}>{title}</Text>
          <Text style={styles.eventTime}>{formatDateTime(event.at)}</Text>
        </View>
        <Text numberOfLines={1} style={styles.text}>
          {name}
        </Text>
        {detail ? (
          <Text numberOfLines={2} style={styles.muted}>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
  if (!navigation) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${name}, ${formatTime(event.at)}. Session öffnen`}
      onPress={open}
    >
      {body}
    </Pressable>
  );
}

export function RecoveryHistory({
  events,
  loaded,
  styles,
  colors,
  navigation,
}: {
  events: readonly RecoveryEvent[];
  loaded: boolean;
  styles: Styles;
  colors: Colors;
  navigation: Navigation;
}) {
  const [showAll, setShowAll] = useState(false);
  const toggle = useCallback(() => setShowAll((value) => !value), []);
  const sorted = useMemo(() => [...events].sort((a, b) => b.at.localeCompare(a.at)), [events]);
  const visible = showAll ? sorted : sorted.slice(0, HISTORY_PREVIEW);
  const trailing = useMemo(
    () => <Icon name="History" size={16} color={colors.foregroundMuted} />,
    [colors.foregroundMuted],
  );
  return (
    <SettingsSection title="Verlauf" trailing={trailing}>
      <SettingsCard>
        {loaded && sorted.length === 0 ? (
          <SettingsRow
            label="Noch keine Fortsetzungen"
            hint="Automatische und manuelle Fortsetzungen erscheinen hier mit Uhrzeit und Grund"
          />
        ) : null}
        {visible.length > 0 ? (
          <View style={styles.timeline}>
            {visible.map((event, index) => (
              <HistoryEntry
                key={event.id}
                event={event}
                last={index === visible.length - 1}
                styles={styles}
                colors={colors}
                navigation={navigation}
              />
            ))}
          </View>
        ) : null}
        {sorted.length > HISTORY_PREVIEW ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              showAll ? "Weniger Verlauf anzeigen" : `Alle ${sorted.length} Einträge anzeigen`
            }
            onPress={toggle}
            style={styles.more}
          >
            <Text style={styles.muted}>
              {showAll ? "Weniger anzeigen" : `Alle ${sorted.length} anzeigen`}
            </Text>
          </Pressable>
        ) : null}
      </SettingsCard>
    </SettingsSection>
  );
}
