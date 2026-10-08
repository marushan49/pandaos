import { type PluginAgentPanelProps, useAgent, usePaseo } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { askSideQuestion, findSideAgentId, resetSideAgent } from "./side-agent";

interface Line {
  key: string;
  role: "user" | "assistant";
  text: string;
}

export function BtwPanel({ agentId, theme }: PluginAgentPanelProps) {
  const paseo = usePaseo();
  const cache = useQueryClient();
  const parent = useAgent(agentId, ({ id, cwd, title }) => ({ id, cwd, title }));
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const key = useMemo(() => ["btw", agentId], [agentId]);

  const side = useQuery({
    queryKey: key,
    refetchInterval: 2000,
    queryFn: async () => {
      const sideId = await findSideAgentId(paseo, agentId);
      if (!sideId) return { sideId: null, lines: [] as Line[], running: false };
      const handle = paseo.agents.ref(sideId);
      const page = await handle.timeline.refetch({ direction: "tail", limit: 80 });
      const lines: Line[] = [];
      page.entries.forEach((entry, index) => {
        const item = entry.item;
        if (item.type === "user_message") {
          const question = item.text.split("Side question:").pop()?.trim() ?? item.text;
          lines.push({ key: `u${index}`, role: "user", text: question });
        }
        if (item.type === "assistant_message") {
          lines.push({ key: `a${index}`, role: "assistant", text: item.text });
        }
      });
      const status = page.agent?.status;
      return { sideId, lines, running: status === "running" || status === "initializing" };
    },
  });

  useEffect(() => {
    setError(null);
  }, [agentId]);

  const send = useCallback(async () => {
    const question = draft.trim();
    if (!question || !parent) return;
    setSending(true);
    setError(null);
    try {
      await askSideQuestion(paseo, parent, question);
      setDraft("");
      await cache.invalidateQueries({ queryKey: key });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSending(false);
    }
  }, [draft, parent, paseo, cache, key]);

  const reset = useCallback(async () => {
    await resetSideAgent(paseo, agentId);
    await cache.invalidateQueries({ queryKey: key });
  }, [paseo, agentId, cache, key]);

  const styles = useMemo(
    () => ({
      root: { flex: 1, backgroundColor: theme.colors.surface0 },
      scroll: { flex: 1 },
      list: { padding: 16, gap: 10 },
      user: {
        alignSelf: "flex-end" as const,
        maxWidth: "85%" as const,
        padding: 10,
        borderRadius: 10,
        backgroundColor: theme.colors.accent,
      },
      userText: { color: theme.colors.accentForeground },
      bot: {
        alignSelf: "flex-start" as const,
        maxWidth: "92%" as const,
        padding: 10,
        borderRadius: 10,
        backgroundColor: theme.colors.surface2,
      },
      text: { color: theme.colors.foreground },
      muted: { color: theme.colors.foregroundMuted, paddingHorizontal: 16, paddingBottom: 6 },
      error: { color: theme.colors.statusDanger, paddingHorizontal: 16, paddingBottom: 6 },
      bar: { flexDirection: "row" as const, gap: 8, padding: 12, alignItems: "flex-end" as const },
      input: {
        flex: 1,
        minHeight: 40,
        padding: 10,
        borderRadius: 10,
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface2,
      },
      button: { padding: 10, borderRadius: 10, backgroundColor: theme.colors.accent },
      buttonText: { color: theme.colors.accentForeground },
      ghost: { padding: 10, borderRadius: 10, backgroundColor: theme.colors.surface2 },
    }),
    [theme],
  );

  const lines = side.data?.lines ?? [];
  let status = "Ask anything about this session. The main session keeps running.";
  if (side.data?.running || sending) status = "Thinking…";
  else if (lines.length > 0) status = "Side chat. Does not touch the main session.";

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
        {lines.map((line) => (
          <View key={line.key} style={line.role === "user" ? styles.user : styles.bot}>
            <Text style={line.role === "user" ? styles.userText : styles.text}>{line.text}</Text>
          </View>
        ))}
      </ScrollView>
      <Text style={styles.muted}>{status}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.bar}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask a side question"
          placeholderTextColor={theme.colors.foregroundMuted}
          multiline
          onSubmitEditing={send}
          accessibilityLabel="Side question"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send side question"
          style={styles.button}
          disabled={sending || draft.trim() === ""}
          onPress={send}
        >
          <Text style={styles.buttonText}>Ask</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start a new side chat"
          style={styles.ghost}
          onPress={reset}
        >
          <Text style={styles.text}>New</Text>
        </Pressable>
      </View>
    </View>
  );
}
