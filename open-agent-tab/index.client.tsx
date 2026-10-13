import type { PluginClientContext, PluginScreenProps } from "@getpaseo/plugin/client";
import { useEffect, useMemo } from "react";
import { Text, View } from "react-native";

const REQUEST_LABEL = "pandaos.open-tab-request";
const MAX_AGE_MS = 120_000;

function OpenAgent({ params, navigation, theme, layout }: PluginScreenProps) {
  const agentId = params.agentId;
  useEffect(() => {
    if (agentId && navigation) navigation.openAgent({ agentId });
  }, [agentId, navigation]);
  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        padding: layout.compact ? 16 : 24,
        backgroundColor: theme.colors.surface0,
      },
      text: { color: theme.colors.foreground },
    }),
    [theme, layout.compact],
  );
  return (
    <View style={styles.screen}>
      <Text style={styles.text}>
        {navigation
          ? "Session wird geöffnet …"
          : "Diese PandaOS-Version kann keine Session öffnen."}
      </Text>
    </View>
  );
}

interface AgentLike {
  id: string;
  labels?: Record<string, string> | null;
}

export default function contribute(client: PluginClientContext) {
  const lifetime = new AbortController();
  const handled = new Map<string, string>();
  const consider = (agent: AgentLike, fromSnapshot: boolean) => {
    const request = agent.labels?.[REQUEST_LABEL];
    if (!request || handled.get(agent.id) === request) return;
    handled.set(agent.id, request);
    if (fromSnapshot && !(Date.now() - Number(request) < MAX_AGE_MS)) return;
    client.openScreen({ screenId: "open", params: { agentId: agent.id } });
  };
  client.addScreen({ id: "open", title: "Session öffnen", Component: OpenAgent });
  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ subscription }) => {
      subscription.subscribe({
        snapshot: ({ entries }) => {
          for (const { agent } of entries) consider(agent, true);
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "remove") handled.delete(update.agentId);
          else consider(update.agent, false);
        },
      });
      return undefined;
    })
    .catch((error) => {
      if (!lifetime.signal.aborted) console.error("Agent observation failed", error);
    });
  return () => lifetime.abort();
}
