import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useMemo } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { RecoveryHistory } from "./history";
import { IconButton } from "./icon-button";
import { automaticHint, describeStatus, toneColor, type RecoveryEvent } from "./labels";
import { RecoveryCase } from "./recovery-case";
import { createStyles, type Colors, type Styles } from "./styles";
import { useRecovery } from "./use-recovery";

type Recovery = ReturnType<typeof useRecovery>;

const NO_EVENTS: readonly RecoveryEvent[] = [];

function StatusHeader({
  recovery,
  styles,
  colors,
}: {
  recovery: Recovery;
  styles: Styles;
  colors: Colors;
}) {
  const { query, refresh } = recovery;
  const status = describeStatus(query.data);
  return (
    <View style={styles.status} accessibilityRole="summary">
      <View style={styles.statusBadge}>
        {query.isPending ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Icon name={status.icon} size={22} color={toneColor(colors, status.tone)} />
        )}
      </View>
      <View style={styles.statusText}>
        <Text style={styles.statusTitle}>{status.title}</Text>
        <Text style={styles.muted}>{status.line}</Text>
      </View>
      {query.isFetching && !query.isPending ? (
        <ActivityIndicator color={colors.foregroundMuted} />
      ) : (
        <IconButton
          icon="RefreshCw"
          label="Recovery-Liste aktualisieren"
          color={colors.foreground}
          disabled={query.isFetching}
          styles={styles}
          onPress={refresh}
        />
      )}
    </View>
  );
}

function Messages({ recovery, styles }: { recovery: Recovery; styles: Styles }) {
  const { query, actionError, actionPending, notice } = recovery;
  return (
    <>
      {query.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {query.error.message}
        </Text>
      ) : null}
      {actionError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {actionError.message}
        </Text>
      ) : null}
      {actionPending ? <Text style={styles.muted}>Aktion wird ausgeführt...</Text> : null}
      {notice ? (
        <Text accessibilityRole="alert" style={styles.success}>
          {notice}
        </Text>
      ) : null}
    </>
  );
}

function OpenCases({
  recovery,
  styles,
  colors,
  navigation,
}: {
  recovery: Recovery;
  styles: Styles;
  colors: Colors;
  navigation: PluginScreenProps["navigation"];
}) {
  const data = recovery.query.data;
  const open = data?.candidates.length ?? 0;
  return (
    <SettingsSection title={open > 0 ? `Offene Fälle, ${open}` : "Offene Fälle"}>
      <SettingsCard>
        {data && open === 0 ? (
          <SettingsRow
            label="Keine unterbrochenen Sessions"
            hint="Abgeschlossene, gestoppte und archivierte Läufe werden ausgeschlossen"
          />
        ) : null}
        {data?.candidates.map((record, index) => (
          <RecoveryCase
            key={record.agentId}
            record={record}
            index={index}
            automatic={data.automatic}
            styles={styles}
            colors={colors}
            pending={recovery.actionPending}
            navigation={navigation}
            onAction={recovery.onAction}
          />
        ))}
      </SettingsCard>
    </SettingsSection>
  );
}

export function RecoveryScreen({ theme, layout, host, navigation }: PluginScreenProps) {
  const colors = theme.colors;
  const styles = useMemo(() => createStyles(colors, layout.compact), [colors, layout.compact]);
  const recovery = useRecovery(host.id);
  const data = recovery.query.data;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <StatusHeader recovery={recovery} styles={styles} colors={colors} />
        <Messages recovery={recovery} styles={styles} />
        <SettingsSection title="Automatisch fortsetzen">
          <SettingsCard>
            <SettingsSwitch
              label="Automatisch fortsetzen"
              hint={automaticHint(data?.automatic)}
              value={recovery.automaticEnabled}
              disabled={!data || recovery.automaticPending}
              error={recovery.automaticError?.message ?? null}
              onValueChange={recovery.toggleAutomatic}
            />
          </SettingsCard>
        </SettingsSection>
        <OpenCases recovery={recovery} styles={styles} colors={colors} navigation={navigation} />
        <RecoveryHistory
          events={data?.history ?? NO_EVENTS}
          loaded={Boolean(data)}
          styles={styles}
          colors={colors}
          navigation={navigation}
        />
      </View>
    </ScrollView>
  );
}
