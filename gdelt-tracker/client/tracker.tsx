import { useRpc, type PluginHostProps } from "@getpaseo/plugin/client";
import { Modal, ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { pollNow, readState } from "../shared/contracts.ts";
import { strengthLabels, type Alert, type Entry, type Quote } from "../shared/model.ts";
import { Button } from "./controls.tsx";
import { Detail } from "./detail.tsx";
import { Settings } from "./settings.tsx";
import { delay, directionColor, time, useStyles, type Styles } from "./styles.ts";

type Day = "up" | "down" | "flat";

function dayStatus(entry: Entry, quotes: Record<string, Quote>, alerts: Alert[]): Day {
  const quote = entry.ticker ? quotes[entry.ticker] : undefined;
  if (quote && Date.now() - Date.parse(quote.at) < 4 * 86_400_000) {
    if (quote.changePercent > 0.05) return "up";
    if (quote.changePercent < -0.05) return "down";
    return "flat";
  }
  const today = new Date().toDateString();
  let score = 0;
  for (const alert of alerts) {
    if (alert.entryId !== entry.id || alert.strength === "low") continue;
    if (new Date(alert.publishedAt).toDateString() !== today) continue;
    if (alert.direction === "positive") score += 1;
    if (alert.direction === "negative") score -= 1;
  }
  if (score > 0) return "up";
  if (score < 0) return "down";
  return "flat";
}

function PositionChip({
  entry,
  day,
  quote,
  selected,
  styles,
  onSelect,
}: {
  entry: Entry | null;
  day: Day;
  quote?: Quote;
  selected: boolean;
  styles: Styles;
  onSelect(id: string | null): void;
}) {
  const c = styles.theme.colors;
  const color = { up: c.statusSuccess, down: c.statusDanger, flat: c.foregroundMuted }[day];
  const press = useCallback(() => onSelect(entry?.id ?? null), [onSelect, entry]);
  const style = useCallback(
    ({ pressed }: PressableStateCallbackType) => ({
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: selected ? c.foreground : c.border,
      backgroundColor: selected || pressed ? c.surface2 : c.surface0,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
    }),
    [selected, c],
  );
  const state = useMemo(() => ({ selected }), [selected]);
  const dot = useMemo(() => [styles.dot, { backgroundColor: color }], [styles.dot, color]);
  const change = useMemo(() => [styles.muted, { color }], [styles.muted, color]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={entry ? `Nur ${entry.name} anzeigen` : "Alle Positionen anzeigen"}
      accessibilityState={state}
      onPress={press}
      style={style}
    >
      {entry ? <View style={dot} /> : null}
      <Text style={styles.strong} numberOfLines={1}>
        {entry?.name ?? "Alle"}
      </Text>
      {quote ? (
        <Text style={change}>
          {`${quote.changePercent > 0 ? "+" : ""}${quote.changePercent.toFixed(1)} %`}
        </Text>
      ) : null}
    </Pressable>
  );
}

function AlertCard({
  alert,
  entry,
  selected,
  styles,
  onOpen,
}: {
  alert: Alert;
  entry?: Entry;
  selected: boolean;
  styles: Styles;
  onOpen(id: string): void;
}) {
  const c = styles.theme.colors;
  const color = directionColor(styles.theme, alert.direction);
  const open = useCallback(() => onOpen(alert.id), [onOpen, alert.id]);
  const style = useCallback(
    ({ pressed }: PressableStateCallbackType) => ({
      padding: 14,
      gap: 6,
      borderRadius: 12,
      borderWidth: 1,
      borderLeftWidth: 5,
      borderColor: selected ? c.foreground : c.border,
      borderLeftColor: color,
      backgroundColor: selected || pressed ? c.surface2 : c.surface1,
    }),
    [selected, color, c],
  );
  const state = useMemo(() => ({ selected }), [selected]);
  const name = useMemo(() => [styles.strong, styles.grow], [styles.strong, styles.grow]);
  const strength = useMemo(() => [styles.badgeText, { color }], [styles.badgeText, color]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry?.name ?? "Position"}: ${alert.summary}`}
      accessibilityState={state}
      onPress={open}
      style={style}
    >
      <View style={styles.row}>
        <Text style={name} numberOfLines={1}>
          {entry?.name ?? "Entfernte Position"}
        </Text>
        <Text style={strength}>{strengthLabels[alert.strength]}</Text>
      </View>
      <Text style={styles.text} numberOfLines={3}>
        {alert.summary}
      </Text>
      <Text style={styles.muted} numberOfLines={1}>
        {`${alert.domain}  ${time(alert.publishedAt)}  +${delay(alert)}`}
      </Text>
    </Pressable>
  );
}

function statusLine(lastRun: string, empty: boolean) {
  if (empty)
    return "Noch keine Positionen. Öffne Positionen und zieh einen Depot-Screenshot hinein.";
  if (lastRun) return `Zuletzt geprüft ${time(lastRun)}. Jede Position alle 15 Minuten.`;
  return "Erste Prüfung startet gleich.";
}

function Status({
  styles,
  status,
  empty,
}: {
  styles: Styles;
  status: Record<string, string>;
  empty: boolean;
}) {
  const problems = [
    status.model && `KI: ${status.model}`,
    status.gdelt && `GDELT: ${status.gdelt}`,
    status.finnhub && `Finnhub: ${status.finnhub}`,
    status.telegram && `Telegram: ${status.telegram}`,
  ].filter(Boolean);
  return (
    <View>
      <Text style={styles.muted}>{statusLine(status.lastRun ?? "", empty)}</Text>
      {problems.map((problem) => (
        <Text key={problem} accessibilityRole="alert" style={styles.danger}>
          {problem}
        </Text>
      ))}
    </View>
  );
}

export function Tracker({ theme, layout }: PluginHostProps) {
  const styles = useStyles(theme, layout.compact);
  const read = useRpc(readState);
  const poll = useRpc(pollNow);
  const cache = useQueryClient();
  const toast = useToast();
  const state = useQuery({
    queryKey: ["aktien-state"],
    queryFn: () => read({}),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const [filter, setFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const polling = useMutation({
    mutationFn: () => poll({}),
    onSuccess: () => {
      setTimeout(() => void cache.invalidateQueries({ queryKey: ["aktien-state"] }), 15_000);
    },
  });
  const newest = useRef<string | null>(null);
  const data = state.data;
  useEffect(() => {
    const first = data?.alerts[0];
    if (!first) return;
    if (newest.current && newest.current !== first.id && first.strength !== "low")
      toast.show(`Neue Meldung: ${first.summary}`, { variant: "info", durationMs: 5000 });
    newest.current = first.id;
  }, [data, toast]);

  const entries = useMemo(() => data?.watchlist.entries ?? [], [data]);
  const alerts = useMemo(
    () =>
      [...(data?.alerts ?? [])]
        .filter((alert) => !filter || alert.entryId === filter)
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
    [data, filter],
  );
  const byId = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
  const selected =
    alerts.find((alert) => alert.id === selectedId) ?? (layout.compact ? undefined : alerts[0]);
  const related = useMemo(
    () =>
      selected
        ? (data?.alerts ?? [])
            .filter((alert) => alert.entryId === selected.entryId && alert.id !== selected.id)
            .slice(0, 6)
        : [],
    [data, selected],
  );
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const { mutate: runPoll } = polling;
  const runNow = useCallback(() => runPoll(), [runPoll]);
  const back = useCallback(() => setSelectedId(null), []);
  const title = useMemo(() => [styles.title, styles.grow], [styles.title, styles.grow]);

  const list = (
    <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
      {alerts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.strong}>Noch keine Meldungen</Text>
          <Text style={styles.muted}>
            Neue Meldungen erscheinen hier, sobald der Hintergrundabruf etwas Relevantes findet.
          </Text>
        </View>
      ) : null}
      {alerts.map((alert) => (
        <AlertCard
          key={alert.id}
          alert={alert}
          entry={byId.get(alert.entryId)}
          selected={alert.id === selected?.id}
          styles={styles}
          onOpen={setSelectedId}
        />
      ))}
    </ScrollView>
  );
  const detail = selected ? (
    <Detail
      alert={selected}
      entry={byId.get(selected.entryId)}
      related={related}
      styles={styles}
      onOpen={setSelectedId}
      onBack={layout.compact ? back : undefined}
    />
  ) : null;
  let body = (
    <>
      {list}
      {detail ?? (
        <View style={styles.detail}>
          <View style={styles.empty}>
            <Text style={styles.muted}>
              Wähle links eine Meldung für Einordnung, Zeitstrahl und Fragen.
            </Text>
          </View>
        </View>
      )}
    </>
  );
  if (layout.compact) body = detail ?? list;

  return (
    <View style={styles.screen}>
      <View style={styles.page}>
        <View style={styles.header}>
          <Text style={title} numberOfLines={1}>
            Aktien-Alerts
          </Text>
          <Button
            theme={theme}
            label="Jetzt prüfen"
            icon="RefreshCw"
            text={layout.compact ? undefined : "Jetzt prüfen"}
            disabled={polling.isPending || entries.length === 0}
            onPress={runNow}
          />
          <Button
            theme={theme}
            label="Positionen und Einstellungen"
            icon="Settings"
            text={layout.compact ? undefined : "Positionen"}
            onPress={openSettings}
          />
        </View>
        {state.error ? (
          <Text accessibilityRole="alert" style={styles.danger}>
            {state.error.message}
          </Text>
        ) : null}
        {data ? <Status styles={styles} status={data.status} empty={entries.length === 0} /> : null}
        {entries.length > 0 ? (
          <ScrollView horizontal style={styles.bar} contentContainerStyle={styles.barContent}>
            <PositionChip
              entry={null}
              day="flat"
              selected={!filter}
              styles={styles}
              onSelect={setFilter}
            />
            {entries.map((entry) => (
              <PositionChip
                key={entry.id}
                entry={entry}
                day={dayStatus(entry, data?.quotes ?? {}, data?.alerts ?? [])}
                quote={entry.ticker ? data?.quotes[entry.ticker] : undefined}
                selected={filter === entry.id}
                styles={styles}
                onSelect={setFilter}
              />
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.body}>{body}</View>
      </View>
      {data ? (
        <Modal
          title="Positionen und Einstellungen"
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        >
          <Modal.Content scrollable>
            <Settings watchlist={data.watchlist} config={data.config} styles={styles} />
          </Modal.Content>
        </Modal>
      ) : null}
    </View>
  );
}
