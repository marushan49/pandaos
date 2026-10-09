import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useCallback } from "react";
import { Text, View } from "react-native";
import type { RecoveryCandidate } from "../shared/contracts";
import { IconButton } from "./icon-button";
import { type AutomaticState, caseState, firstLine, formatDateTime } from "./labels";
import type { Colors, Styles } from "./styles";
import type { Action } from "./use-recovery";

export function RecoveryCase({
  record,
  index,
  automatic,
  styles,
  colors,
  pending,
  navigation,
  onAction,
}: {
  record: RecoveryCandidate;
  index: number;
  automatic: AutomaticState;
  styles: Styles;
  colors: Colors;
  pending: boolean;
  navigation: PluginScreenProps["navigation"];
  onAction(record: RecoveryCandidate, action: Action): void;
}) {
  const name = record.title ?? record.agentId;
  const resume = useCallback(() => onAction(record, "resume"), [record, onAction]);
  const dismiss = useCallback(() => onAction(record, "dismiss"), [record, onAction]);
  const open = useCallback(
    () => navigation?.openAgent({ agentId: record.agentId }),
    [navigation, record.agentId],
  );
  const state = caseState(record, automatic);
  const warning = state.tone === "warning";
  return (
    <View style={index > 0 ? styles.caseNext : styles.caseFirst}>
      <View style={styles.caseHead}>
        <View style={styles.caseTitleBlock}>
          <Text numberOfLines={1} style={styles.caseTitle}>
            {name}
          </Text>
          <Text numberOfLines={1} style={styles.muted}>
            {record.provider}, unterbrochen {formatDateTime(record.updatedAt)}
          </Text>
        </View>
        <View style={styles.caseActions}>
          <IconButton
            icon="Play"
            label={`Weiterarbeiten: ${name}`}
            color={colors.accent}
            disabled={pending || !record.canResume}
            styles={styles}
            onPress={resume}
          />
          {navigation ? (
            <IconButton
              icon="ExternalLink"
              label={`Session öffnen: ${name}`}
              color={colors.foreground}
              styles={styles}
              onPress={open}
            />
          ) : null}
          <IconButton
            icon="EyeOff"
            label={`Ausblenden: ${name}`}
            color={colors.foregroundMuted}
            disabled={pending}
            styles={styles}
            onPress={dismiss}
          />
        </View>
      </View>
      <View style={styles.stateLine}>
        <Icon
          name={state.icon}
          size={14}
          color={warning ? colors.statusWarning : colors.foregroundMuted}
        />
        <Text style={warning ? styles.stateWarning : styles.stateMuted}>{state.text}</Text>
      </View>
      <Text numberOfLines={2} style={styles.muted}>
        {firstLine(record.reason)}
      </Text>
    </View>
  );
}
