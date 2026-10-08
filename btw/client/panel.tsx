import { type PluginAgentPanelProps, useAgent, usePaseo } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

const SUGGESTIONS = [
  "What is this session doing right now?",
  "Summarize what changed so far",
  "What is blocking progress?",
];
import { askSideQuestion, findSideAgentId, resetSideAgent } from "./side-agent";

interface Line {
  key: string;
  role: "user" | "assistant";
  text: string;
}

function Suggestion(props: {
  text: string;
  style: object;
  textStyle: object;
  onPick(text: string): Promise<void>;
}) {
  const { text, onPick } = props;
  const pick = useCallback(() => void onPick(text), [onPick, text]);
  return (
    <Pressable accessibilityRole="button" style={props.style} onPress={pick}>
      <Text style={props.textStyle}>{text}</Text>
    </Pressable>
  );
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

  const scrollRef = useRef<ScrollView>(null);

  const send = useCallback(
    async (text?: string) => {
      const question = (text ?? draft).trim();
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
    },
    [draft, parent, paseo, cache, key],
  );

  const submit = useCallback(() => void send(), [send]);
  const onKeyPress = useCallback(
    (event: { nativeEvent: { key: string; shiftKey?: boolean }; preventDefault?: () => void }) => {
      if (event.nativeEvent.key !== "Enter" || event.nativeEvent.shiftKey) return;
      event.preventDefault?.();
      void send();
    },
    [send],
  );
  const scrollToEnd = useCallback(() => scrollRef.current?.scrollToEnd({ animated: true }), []);

  const reset = useCallback(async () => {
    await resetSideAgent(paseo, agentId);
    await cache.invalidateQueries({ queryKey: key });
  }, [paseo, agentId, cache, key]);

  const styles = useMemo(() => {
    const c = theme.colors;
    return {
      root: { flex: 1, backgroundColor: c.surface0 },
      header: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: c.border,
      },
      title: { color: c.foreground, fontSize: 14, fontWeight: "600" as const },
      subtitle: { color: c.foregroundMuted, fontSize: 12, marginTop: 2 },
      scroll: { flex: 1 },
      list: { padding: 16, gap: 12, flexGrow: 1 },
      empty: { flex: 1, justifyContent: "center" as const, gap: 8 },
      emptyTitle: { color: c.foreground, fontSize: 15, fontWeight: "600" as const },
      emptyText: { color: c.foregroundMuted, fontSize: 13, lineHeight: 19, marginBottom: 8 },
      chip: {
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface1,
      },
      chipText: { color: c.foreground, fontSize: 13 },
      user: {
        alignSelf: "flex-end" as const,
        maxWidth: "88%" as const,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 14,
        backgroundColor: c.accent,
      },
      userText: { color: c.accentForeground, fontSize: 14, lineHeight: 20 },
      bot: {
        alignSelf: "flex-start" as const,
        maxWidth: "96%" as const,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface1,
      },
      text: { color: c.foreground, fontSize: 14, lineHeight: 20 },
      thinking: { color: c.foregroundMuted, fontSize: 13, fontStyle: "italic" as const },
      error: { color: c.statusDanger, fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 },
      composer: {
        margin: 12,
        paddingLeft: 12,
        paddingRight: 8,
        paddingVertical: 8,
        flexDirection: "row" as const,
        alignItems: "flex-end" as const,
        gap: 8,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface1,
      },
      input: {
        flex: 1,
        maxHeight: 140,
        minHeight: 24,
        paddingVertical: 6,
        fontSize: 14,
        color: c.foreground,
      },
      send: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        backgroundColor: c.accent,
      },
      sendText: { color: c.accentForeground, fontSize: 16, fontWeight: "700" as const },
      ghost: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
      ghostText: { color: c.foregroundMuted, fontSize: 12 },
    };
  }, [theme]);

  const lines = side.data?.lines ?? [];
  const busy = Boolean(side.data?.running) || sending;
  const canSend = !sending && draft.trim() !== "";
  const sendStyle = useMemo(
    () => [styles.send, { opacity: canSend ? 1 : 0.4 }],
    [styles.send, canSend],
  );
  const suggestionButtons = SUGGESTIONS.map((suggestion) => (
    <Suggestion
      key={suggestion}
      text={suggestion}
      style={styles.chip}
      textStyle={styles.chipText}
      onPick={send}
    />
  ));

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Side chat</Text>
          <Text style={styles.subtitle}>Answers from this session. It keeps running.</Text>
        </View>
        {lines.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start a new side chat"
            style={styles.ghost}
            onPress={reset}
          >
            <Text style={styles.ghostText}>New chat</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.list}
        onContentSizeChange={scrollToEnd}
      >
        {lines.length === 0 && !busy ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Ask something on the side</Text>
            <Text style={styles.emptyText}>
              Reads the latest of this session and answers without interrupting it.
            </Text>
            {suggestionButtons}
          </View>
        ) : null}
        {lines.map((line) => (
          <View key={line.key} style={line.role === "user" ? styles.user : styles.bot}>
            <Text selectable style={line.role === "user" ? styles.userText : styles.text}>
              {line.text}
            </Text>
          </View>
        ))}
        {busy ? <Text style={styles.thinking}>Thinking…</Text> : null}
      </ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask a side question"
          placeholderTextColor={theme.colors.foregroundMuted}
          multiline
          onKeyPress={onKeyPress}
          accessibilityLabel="Side question"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send side question"
          style={sendStyle}
          disabled={!canSend}
          onPress={submit}
        >
          <Text style={styles.sendText}>↑</Text>
        </Pressable>
      </View>
    </View>
  );
}
