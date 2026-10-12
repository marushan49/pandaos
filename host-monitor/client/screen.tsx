import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useCallback, useMemo, useRef, useState } from "react";
import { type LayoutChangeEvent, Pressable, ScrollView, Text, View } from "react-native";
import type { HostAgent, HostConsumer, HostTab, HostTriage, HostVerdict } from "../shared/host";
import { useHostCloseTab, useHostSnapshot, useHostStop, useHostTriage } from "./use-host";

const VERDICT_LABEL: Record<HostVerdict, string> = {
  fits: "Fits",
  tight: "Tight",
  avoid: "Avoid",
};

const HISTORY_HEIGHT = 64;

function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / 1440)} days`;
}

function describeTab(tab: HostTab): string {
  return [
    tab.workspace ?? tab.workspaceId,
    tab.loaded === false ? "not loaded, reopens with its workspace" : null,
    tab.memoryGb === null ? null : `JS memory ${tab.memoryGb.toFixed(2)} GB`,
    tab.ageMinutes === null ? null : `open ${formatAge(tab.ageMinutes)}`,
  ]
    .filter(Boolean)
    .join(" | ");
}

function tabName(tab: HostTab): string {
  if (tab.title) return tab.title;
  try {
    const url = new URL(tab.url);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return tab.url;
  }
}

function describeConsumer(consumer: HostConsumer): string {
  const place = consumer.home
    ? `home ${consumer.home}`
    : (consumer.unit ?? consumer.folder ?? "no unit or folder");
  const ports = consumer.ports.map((port) => `port ${port.port}: ${port.connections} connected`);
  return [
    place,
    ...ports,
    `frees ${consumer.freeOnStopGb.toFixed(1)} GB on stop`,
    `running ${formatAge(consumer.ageMinutes)}`,
  ].join(" | ");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const VERDICT_TEXT: Record<NonNullable<HostTriage["verdict"]>, string> = {
  needed: "Needed",
  not_needed: "Not needed",
  unclear: "Unclear",
};

function describeAgent(agent: HostAgent): string {
  const processes =
    agent.processes > 0
      ? `${agent.processes} processes, ${agent.gb.toFixed(1)} GB`
      : "no process on this host";
  return [agent.status, processes, agent.unit, agent.folder].filter(Boolean).join(" | ");
}

function describeTriage(triage: HostTriage): string {
  switch (triage.state) {
    case "none":
      return "Not checked yet";
    case "asking":
      return "Asked the agent, waiting for the answer";
    case "judging":
      return "Judging the answer";
    case "failed":
      return `Check failed: ${triage.reason ?? "unknown error"}`;
    case "done":
      return `${VERDICT_TEXT[triage.verdict ?? "unclear"]}: ${triage.reason ?? ""}`;
  }
}

export function HostScreen({ theme, layout, host, navigation }: PluginScreenProps) {
  const { data, error, isFetching, refetch } = useHostSnapshot();
  const scrollRef = useRef<ScrollView>(null);
  const tabsTop = useRef(0);
  const onTabsLayout = useCallback((event: LayoutChangeEvent) => {
    tabsTop.current = event.nativeEvent.layout.y;
  }, []);
  const onShowTabs = useCallback(() => {
    scrollRef.current?.scrollTo({ y: tabsTop.current, animated: true });
  }, []);
  const openWorkspace = navigation?.openWorkspace;
  const onRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);
  const [note, setNote] = useState<string | null>(null);
  const requestCheck = useHostTriage();
  const onCheck = useCallback(
    (agentId: string) => {
      requestCheck({ agentId })
        .then((result) => setNote(result.message))
        .catch((failure: unknown) => setNote(errorText(failure)))
        .finally(() => {
          void refetch();
        });
    },
    [requestCheck, refetch],
  );
  const stopProcess = useHostStop();
  const closeTabRpc = useHostCloseTab();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    (key: string, action: () => Promise<{ message: string }>) => {
      setBusy(key);
      action()
        .then((result) => setNote(result.message))
        .catch((failure: unknown) => setNote(errorText(failure)))
        .finally(() => {
          setBusy(null);
          void refetch();
        });
    },
    [refetch],
  );
  const onStop = useCallback(
    (pid: number) => run(`pid:${pid}`, () => stopProcess({ pid })),
    [run, stopProcess],
  );
  const onCloseTab = useCallback(
    (tab: HostTab) =>
      run(`tab:${tab.browserId}`, () =>
        closeTabRpc({ workspaceId: tab.workspaceId, browserId: tab.browserId }),
      ),
    [run, closeTabRpc],
  );
  const onCloseUnloaded = useCallback(
    (tabs: HostTab[]) =>
      run("tabs:unloaded", async () => {
        let closed = 0;
        for (const tab of tabs) {
          const result = await closeTabRpc({
            workspaceId: tab.workspaceId,
            browserId: tab.browserId,
          });
          if (result.closed) closed += 1;
        }
        return { message: `${closed} of ${tabs.length} unloaded tabs closed.` };
      }),
    [run, closeTabRpc],
  );
  const total = data?.memory.totalGb ?? 0;
  const usedShare = data && total > 0 ? data.memory.usedGb / total : 0;
  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: { padding: layout.compact ? 16 : 24, gap: 16 },
      heading: {
        color: theme.colors.foreground,
        fontSize: layout.compact ? 22 : 26,
        fontWeight: "600" as const,
      },
      title: { color: theme.colors.foreground, fontSize: 15, fontWeight: "600" as const },
      body: { color: theme.colors.foreground, fontSize: 14 },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      error: { color: theme.colors.statusDanger, fontSize: 14 },
      card: { padding: 14, borderRadius: 10, gap: 10, backgroundColor: theme.colors.surface1 },
      row: {
        flexDirection: "row" as const,
        justifyContent: "space-between" as const,
        alignItems: "flex-start" as const,
        gap: 12,
      },
      grow: { flex: 1, gap: 2, minWidth: 0 },
      track: {
        flexDirection: "row" as const,
        height: 12,
        borderRadius: 6,
        overflow: "hidden" as const,
        backgroundColor: theme.colors.surface1,
      },
      history: {
        flexDirection: "row" as const,
        alignItems: "flex-end" as const,
        height: HISTORY_HEIGHT,
        gap: 2,
      },
      button: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: theme.colors.accent,
      },
      buttonText: { color: theme.colors.accentForeground, fontSize: 13 },
      disabledButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: theme.colors.accent,
        opacity: 0.4,
      },
      owner: { gap: 6 },
      consumer: {
        flexDirection: "row" as const,
        justifyContent: "space-between" as const,
        alignItems: "flex-start" as const,
        gap: 12,
        paddingLeft: 12,
      },
      verdict: {
        fits: { color: theme.colors.statusSuccess, fontSize: 13, fontWeight: "600" as const },
        tight: { color: theme.colors.statusWarning, fontSize: 13, fontWeight: "600" as const },
        avoid: { color: theme.colors.statusDanger, fontSize: 13, fontWeight: "600" as const },
      },
    }),
    [theme, layout.compact],
  );
  const usedStyle = useMemo(
    () => ({ flex: usedShare, backgroundColor: theme.colors.accent }),
    [usedShare, theme.colors.accent],
  );
  const bars = useMemo(
    () =>
      (data?.history ?? []).map((point) => ({
        at: point.at,
        style: {
          flex: 1,
          height: Math.max(2, total > 0 ? (point.availableGb / total) * HISTORY_HEIGHT : 2),
          backgroundColor: theme.colors.accent,
          borderRadius: 1,
        },
      })),
    [data, total, theme.colors.accent],
  );
  const agentRows = useMemo(
    () =>
      (data?.agents ?? [])
        .filter(
          (agent) =>
            agent.status !== "closed" &&
            (agent.processes > 0 || agent.status === "running" || agent.triage.state !== "none"),
        )
        .sort((left, right) => right.gb - left.gb)
        .slice(0, 6)
        .map((agent) => {
          const checkable = agent.triage.state !== "asking" && agent.triage.state !== "judging";
          return {
            agent,
            checkable,
            buttonStyle: checkable ? styles.button : styles.disabledButton,
            onPress: () => onCheck(agent.id),
          };
        }),
    [data, onCheck, styles],
  );
  const tabGroups = useMemo(() => {
    const tabs = [...(data?.tabs ?? [])].sort(
      (left, right) =>
        (right.memoryGb ?? 0) - (left.memoryGb ?? 0) ||
        (right.ageMinutes ?? 0) - (left.ageMinutes ?? 0),
    );
    const unloaded = tabs.filter((tab) => tab.loaded === false);
    const ordered = [...tabs.filter((tab) => tab.loaded !== false), ...unloaded];
    return {
      loadedCount: tabs.length - unloaded.length,
      unloadedCount: unloaded.length,
      onCloseUnloaded: () => onCloseUnloaded(unloaded),
      rows: ordered.map((tab) => ({
        tab,
        onPress: () => onCloseTab(tab),
        onOpen: openWorkspace
          ? () => openWorkspace({ workspaceId: tab.workspaceId, serverId: host.id })
          : null,
      })),
    };
  }, [data, onCloseTab, onCloseUnloaded, openWorkspace, host.id]);
  const buttonStyle = busy === null ? styles.button : styles.disabledButton;
  const consumerRows = useMemo(
    () =>
      (data?.consumers ?? []).map((consumer) => ({
        consumer,
        onPress: () => onStop(consumer.pid),
      })),
    [data, onStop],
  );

  if (!data) {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          {error ? (
            <Text style={styles.error}>{errorText(error)}</Text>
          ) : (
            <Text style={styles.muted}>Reading the host...</Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <ScrollView ref={scrollRef} style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.row}>
        <Text style={styles.heading}>{`${data.memory.availableGb.toFixed(1)} GB free`}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh host status"
          onPress={onRefresh}
          style={styles.button}
        >
          <Text style={styles.buttonText}>{isFetching ? "Refreshing" : "Refresh"}</Text>
        </Pressable>
      </View>
      <Text style={styles.muted}>
        {`of ${total.toFixed(1)} GB RAM, sampled ${new Date(data.takenAt).toLocaleTimeString()}`}
      </Text>
      <View style={styles.track}>
        <View style={usedStyle} />
      </View>
      <Text style={styles.body}>
        {`Used ${data.memory.usedGb.toFixed(1)} GB. Swap ${data.memory.swapUsedGb.toFixed(1)} of ${data.memory.swapTotalGb.toFixed(1)} GB. Load ${data.load.one.toFixed(2)} on ${data.load.cpus} cores.`}
      </Text>
      {note ? <Text style={styles.body}>{note}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.title}>What is happening</Text>
        {data.narrative.map((line) => (
          <Text key={line} style={styles.body}>
            {line}
          </Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Cost of a start</Text>
        {data.profiles.map((profile) => (
          <View key={profile.id} style={styles.row}>
            <View style={styles.grow}>
              <Text style={styles.body}>{profile.label}</Text>
              <Text style={styles.muted}>
                {`About ${profile.expectedGb.toFixed(1)} GB, peak ${profile.peakGb.toFixed(1)} GB`}
              </Text>
              <Text style={styles.muted}>
                {`Free after start ${profile.freeAfterGb.toFixed(1)} GB, at peak ${profile.freeAtPeakGb.toFixed(1)} GB`}
              </Text>
            </View>
            <Text style={styles.verdict[profile.verdict]}>{VERDICT_LABEL[profile.verdict]}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Who uses the RAM</Text>
        {data.owners.map((owner) => (
          <View key={owner.owner} style={styles.owner}>
            <Text style={styles.body}>
              {`${owner.owner}: ${owner.gb.toFixed(1)} GB in ${owner.processes} processes`}
            </Text>
            {consumerRows
              .filter(({ consumer }) => consumer.owner === owner.owner)
              .map(({ consumer, onPress }) => (
                <View key={consumer.pid} style={styles.consumer}>
                  <View style={styles.grow}>
                    <Text style={styles.body}>{consumer.label}</Text>
                    <Text style={styles.muted}>{describeConsumer(consumer)}</Text>
                  </View>
                  <Text style={styles.body}>{`${consumer.gb.toFixed(1)} GB`}</Text>
                  {consumer.stoppable ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Stop ${consumer.label}`}
                      disabled={busy !== null}
                      onPress={onPress}
                      style={buttonStyle}
                    >
                      <Text style={styles.buttonText}>
                        {busy === `pid:${consumer.pid}` ? "Stopping" : "Stop"}
                      </Text>
                    </Pressable>
                  ) : null}
                  {consumer.kind === "agent-browser" ? (
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel="Show the agent browser tabs"
                      onPress={onShowTabs}
                      style={styles.button}
                    >
                      <Text style={styles.buttonText}>Tabs</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
          </View>
        ))}
      </View>

      <View style={styles.card} onLayout={onTabsLayout}>
        <View style={styles.row}>
          <View style={styles.grow}>
            <Text style={styles.title}>Browser tabs</Text>
            <Text style={styles.muted}>
              {`${tabGroups.loadedCount} loaded, ${tabGroups.unloadedCount} saved but not loaded. Each Agent browser tab process above is one of the loaded tabs; JS memory shows which tab weighs most.`}
            </Text>
          </View>
          {data.tabsClosable && tabGroups.unloadedCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close all tabs that are not loaded"
              disabled={busy !== null}
              onPress={tabGroups.onCloseUnloaded}
              style={buttonStyle}
            >
              <Text style={styles.buttonText}>
                {busy === "tabs:unloaded" ? "Closing" : `Close ${tabGroups.unloadedCount} unloaded`}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {data.tabsClosable ? null : (
          <Text style={styles.muted}>
            Update this host to see which tabs are loaded and to close them here.
          </Text>
        )}
        {tabGroups.rows.map(({ tab, onPress, onOpen }) => (
          <View key={tab.browserId} style={styles.consumer}>
            <View style={styles.grow}>
              <Text style={styles.body} numberOfLines={1}>
                {tabName(tab)}
              </Text>
              <Text style={styles.muted} numberOfLines={1}>
                {describeTab(tab)}
              </Text>
            </View>
            {onOpen ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Open the workspace of ${tabName(tab)}`}
                onPress={onOpen}
                style={styles.button}
              >
                <Text style={styles.buttonText}>Open</Text>
              </Pressable>
            ) : null}
            {data.tabsClosable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Close tab ${tabName(tab)}`}
                disabled={busy !== null}
                onPress={onPress}
                style={buttonStyle}
              >
                <Text style={styles.buttonText}>
                  {busy === `tab:${tab.browserId}` ? "Closing" : "Close"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Agents</Text>
        {agentRows.length === 0 ? (
          <Text style={styles.muted}>No agent with a process or a running state here.</Text>
        ) : null}
        {agentRows.map((row) => (
          <View key={row.agent.id} style={styles.consumer}>
            <View style={styles.grow}>
              <Text style={styles.body}>{row.agent.title}</Text>
              <Text style={styles.muted}>{describeAgent(row.agent)}</Text>
              <Text style={styles.muted}>{describeTriage(row.agent.triage)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Check need of ${row.agent.title}`}
              disabled={!row.checkable}
              onPress={row.onPress}
              style={row.buttonStyle}
            >
              <Text style={styles.buttonText}>Check need</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Free RAM, last hour</Text>
        <View style={styles.history}>
          {bars.map((bar) => (
            <View key={bar.at} style={bar.style} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
