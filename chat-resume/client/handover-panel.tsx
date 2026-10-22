import { type PluginAgentPanelProps, useAgent, usePaseo } from "@getpaseo/plugin/client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { buildHandoverPrompt, HANDOVER_SOURCE_LABEL } from "../shared/handover";

export function HandoverDraftPanel({ agentId, navigation, theme }: PluginAgentPanelProps) {
  const paseo = usePaseo();
  const target = useAgent(agentId, (agent) => ({
    provider: agent.provider,
    sourceAgentId: agent.labels[HANDOVER_SOURCE_LABEL] ?? null,
  }));
  const sourceAgentId = target?.sourceAgentId ?? null;
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sourceAgentId) {
      setError(null);
      setDraft((current) => current || buildHandoverPrompt(sourceAgentId));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const refreshed = await paseo.agents.ref(agentId).refresh();
        const sourceId = refreshed?.agent.labels?.[HANDOVER_SOURCE_LABEL] ?? null;
        if (cancelled) return;
        if (sourceId) setDraft((current) => current || buildHandoverPrompt(sourceId));
        else setError("This agent is missing its handover source label.");
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, paseo, sourceAgentId]);

  const colors = theme.colors;
  const themed = useMemo(
    () => ({
      container: [styles.container, { backgroundColor: colors.surface0 }],
      title: [styles.title, { color: colors.foreground }],
      help: [styles.help, { color: colors.foregroundMuted }],
      input: [
        styles.input,
        { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface1 },
      ],
      error: [styles.error, { color: colors.statusDanger }],
      buttonText: [styles.buttonText, { color: colors.accentForeground }],
    }),
    [colors],
  );
  const busy = sending || sent;
  const buttonStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      styles.button,
      { backgroundColor: colors.accent, opacity: pressed || busy ? 0.7 : 1 },
    ],
    [colors.accent, busy],
  );

  const sendDraft = useCallback(async () => {
    const prompt = draft.trim();
    if (!prompt || busy) return;
    setSending(true);
    setError(null);
    try {
      await paseo.agents.ref(agentId).send(prompt);
      setSent(true);
      try {
        navigation?.openAgent({ agentId });
      } catch (navigationError) {
        console.warn("[chat-resume] handover started but navigation failed", navigationError);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSending(false);
    }
  }, [agentId, busy, draft, navigation, paseo]);
  const startDraft = useCallback(() => void sendDraft(), [sendDraft]);

  let buttonLabel = "Start agent";
  if (sending) buttonLabel = "Starting…";
  else if (sent) buttonLabel = "Started";

  return (
    <View style={themed.container}>
      <Text style={themed.title}>Handover draft</Text>
      <Text style={themed.help}>
        Review this prompt before starting the new {target?.provider ?? "provider"} agent. It stays
        idle until you press Start agent.
      </Text>
      <TextInput
        accessibilityLabel="Handover prompt"
        multiline
        onChangeText={setDraft}
        placeholder="Loading handover context…"
        placeholderTextColor={colors.foregroundMuted}
        selectionColor={colors.accent}
        style={themed.input}
        textAlignVertical="top"
        value={draft}
      />
      {error ? <Text style={themed.error}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start handover agent"
        disabled={busy || !draft.trim()}
        onPress={startDraft}
        style={buttonStyle}
      >
        <Text style={themed.buttonText}>{buttonLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
  },
  help: {
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    fontFamily: "monospace",
    fontSize: 13,
    lineHeight: 19,
    minHeight: 220,
    padding: 12,
  },
  error: {
    fontSize: 13,
  },
  button: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 16,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
