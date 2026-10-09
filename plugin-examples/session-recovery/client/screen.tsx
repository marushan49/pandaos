import { useMutation, useQuery } from "@tanstack/react-query";
import { type PluginScreenProps, usePaseo, useRpc } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import {
  dismissRecovery,
  listRecovery,
  resumeRecovery,
  type RecoveryCandidate,
} from "../shared/contracts";

type Action = "resume" | "dismiss";
type Colors = PluginScreenProps["theme"]["colors"];

function createStyles(colors: Colors, compact: boolean) {
  const button = {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.surface2,
  };
  return {
    screen: { flex: 1, backgroundColor: colors.surface0 },
    content: { padding: compact ? 16 : 24, gap: 16 },
    title: { color: colors.foreground, fontSize: 24, fontWeight: "600" as const },
    cardTitle: { color: colors.foreground, fontSize: 18, fontWeight: "600" as const },
    text: { color: colors.foreground },
    muted: { color: colors.foregroundMuted },
    error: { color: colors.statusDanger },
    success: { color: colors.statusSuccess },
    warning: { color: colors.statusWarning },
    card: {
      padding: 16,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.surface1,
    },
    actions: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
    button,
    resume: { ...button, backgroundColor: colors.accent },
    resumeText: { color: colors.accentForeground },
  };
}

type Styles = ReturnType<typeof createStyles>;

function RecoveryCard({
  record,
  styles,
  pending,
  onAction,
  navigation,
}: {
  record: RecoveryCandidate;
  styles: Styles;
  pending: boolean;
  onAction(record: RecoveryCandidate, action: Action): void;
  navigation: PluginScreenProps["navigation"];
}) {
  const resume = useCallback(() => onAction(record, "resume"), [record, onAction]);
  const dismiss = useCallback(() => onAction(record, "dismiss"), [record, onAction]);
  const open = useCallback(
    () => navigation?.openAgent({ agentId: record.agentId }),
    [navigation, record.agentId],
  );
  const disabled = pending || !record.canResume;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{record.title ?? record.agentId}</Text>
      <Text style={styles.muted}>{record.provider}</Text>
      <Text selectable style={styles.muted}>
        {record.cwd}
      </Text>
      <Text style={styles.warning}>{record.reason.split("\n", 1)[0]}</Text>
      <Text style={styles.muted}>Unterbrochen: {new Date(record.updatedAt).toLocaleString()}</Text>
      {record.blockedReason ? <Text style={styles.muted}>{record.blockedReason}</Text> : null}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Weiterarbeiten: ${record.title ?? record.agentId}`}
          disabled={disabled}
          onPress={resume}
          style={disabled ? styles.button : styles.resume}
        >
          <Text style={disabled ? styles.muted : styles.resumeText}>Weiterarbeiten</Text>
        </Pressable>
        {navigation ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Session öffnen: ${record.title ?? record.agentId}`}
            onPress={open}
            style={styles.button}
          >
            <Text style={styles.text}>Session öffnen</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ausblenden: ${record.title ?? record.agentId}`}
          disabled={pending}
          onPress={dismiss}
          style={styles.button}
        >
          <Text style={styles.text}>Ausblenden</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function RecoveryScreen({ theme, layout, host, navigation }: PluginScreenProps) {
  const paseo = usePaseo();
  const list = useRpc(listRecovery);
  const resume = useRpc(resumeRecovery);
  const dismiss = useRpc(dismissRecovery);
  const [notice, setNotice] = useState("");
  const styles = useMemo(
    () => createStyles(theme.colors, layout.compact),
    [theme.colors, layout.compact],
  );
  const query = useQuery({
    queryKey: ["session-recovery", host.id],
    queryFn: () => list({}),
    refetchOnWindowFocus: false,
    retry: false,
  });
  const refetch = query.refetch;
  const mutation = useMutation({
    mutationFn: async ({ record, action }: { record: RecoveryCandidate; action: Action }) => {
      const selection = { agentId: record.agentId, revision: record.revision };
      if (action === "resume") await resume(selection);
      else await dismiss(selection);
      return { record, action };
    },
    onSuccess: async ({ record, action }) => {
      setNotice(
        action === "resume"
          ? `${record.title ?? "Session"}: Weiterarbeiten wurde gesendet.`
          : "Eintrag wurde ausgeblendet.",
      );
      await refetch();
    },
    onError: async () => {
      await refetch();
    },
  });
  const mutate = mutation.mutate;
  const onAction = useCallback(
    (record: RecoveryCandidate, action: Action) => {
      setNotice("");
      mutate({ record, action });
    },
    [mutate],
  );
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);
  useEffect(() => {
    const signatures = new Map<string, string>();
    return paseo.agents.subscribe((update) => {
      if (update.kind === "remove") {
        signatures.delete(update.agentId);
        void refetch();
        return;
      }
      const signature = JSON.stringify([
        update.agent.status,
        update.agent.lastError,
        update.agent.archivedAt,
      ]);
      if (signatures.get(update.agent.id) === signature) return;
      signatures.set(update.agent.id, signature);
      void refetch();
    });
  }, [paseo, refetch]);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Unterbrochene Sessions</Text>
      <Text style={styles.muted}>
        Hier stehen fehlgeschlagene Läufe und Arbeit ohne Abschluss nach einem Host-Neustart. Wähle
        eine Session zum Weiterarbeiten.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Recovery-Liste aktualisieren"
        disabled={query.isFetching}
        onPress={refresh}
        style={styles.button}
      >
        <Text style={styles.text}>Aktualisieren</Text>
      </Pressable>
      {query.isPending ? <ActivityIndicator color={theme.colors.accent} /> : null}
      {query.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {query.error.message}
        </Text>
      ) : null}
      {mutation.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {mutation.error.message}
        </Text>
      ) : null}
      {mutation.isPending ? <Text style={styles.muted}>Aktion wird ausgeführt…</Text> : null}
      {notice ? (
        <Text accessibilityRole="alert" style={styles.success}>
          {notice}
        </Text>
      ) : null}
      {query.data ? (
        <Text style={styles.muted}>
          {query.data.tracked} laufende Sessions abgesichert. Zuletzt geprüft:{" "}
          {new Date(query.data.checkedAt).toLocaleTimeString()}.
        </Text>
      ) : null}
      {query.data?.candidates.length === 0 ? (
        <Text style={styles.text}>Keine unterbrochenen Sessions erkannt.</Text>
      ) : null}
      {query.data?.candidates.map((record) => (
        <RecoveryCard
          key={record.agentId}
          record={record}
          styles={styles}
          pending={mutation.isPending}
          onAction={onAction}
          navigation={navigation}
        />
      ))}
      <Text style={styles.muted}>
        Abgeschlossene, gestoppte und archivierte Läufe werden ausgeschlossen. Abstürze vor der
        Installation lassen sich nur bei einem gespeicherten Fehler sicher erkennen.
      </Text>
    </ScrollView>
  );
}
