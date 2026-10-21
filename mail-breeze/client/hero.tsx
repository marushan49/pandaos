import { useMemo } from "react";
import { Text, View, type TextStyle, type ViewStyle } from "react-native";
import type { BreezeState } from "../shared/contracts";
import { greeting, providerName } from "./format";
import { Pill, Row, useKit } from "./kit";
import { Panda } from "./panda";
import { alpha, BREEZE, radius, space, statusLook, type TaskStatus } from "./theme";

const BLOB_TOP: ViewStyle = {
  position: "absolute",
  top: -70,
  right: -50,
  width: 220,
  height: 220,
  borderRadius: 110,
  backgroundColor: alpha(BREEZE.mint, 0.22),
  pointerEvents: "none",
};
const BLOB_BOTTOM: ViewStyle = {
  position: "absolute",
  bottom: -90,
  left: -40,
  width: 240,
  height: 240,
  borderRadius: 120,
  backgroundColor: alpha(BREEZE.sage, 0.16),
  pointerEvents: "none",
};
const BLOB_SUN: ViewStyle = {
  position: "absolute",
  top: 24,
  left: "42%",
  width: 90,
  height: 90,
  borderRadius: 45,
  backgroundColor: alpha(BREEZE.sun, 0.14),
  pointerEvents: "none",
};
const COPY: ViewStyle = { flex: 1, minWidth: 0, gap: space.sm };
const STATS: readonly TaskStatus[] = ["ready", "working", "needs_input", "done"];

function countOf(state: BreezeState | undefined, status: TaskStatus): number {
  return state?.tasks.filter((task) => task.status === status).length ?? 0;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : `${count} ${many}`;
}

function headline(state: BreezeState | undefined): string {
  if (!state) return "Die Brise zieht auf";
  const needs = countOf(state, "needs_input");
  const ready = countOf(state, "ready");
  const working = countOf(state, "working");
  if (needs > 0) return plural(needs, "1 Aufgabe braucht dich", "Aufgaben brauchen dich");
  if (ready > 0) return plural(ready, "1 Mail ist startbereit", "Mails sind startbereit");
  if (working > 0) return plural(working, "1 Aufgabe ist in Arbeit", "Aufgaben sind in Arbeit");
  return state.tasks.length === 0 ? "Dein Posteingang ist frei" : "Alles ist ruhig";
}

function connectionLabel(connection: BreezeState["connection"] | undefined): string {
  if (!connection) return "Postfach nicht verbunden";
  const name = providerName(connection);
  const table = {
    connected: `${name} ${connection.account ?? "verbunden"}`,
    connecting: `${name} verbindet`,
    error: `${name}-Fehler`,
    disconnected: `${name} nicht verbunden`,
  };
  return table[connection.status];
}

function pandaSizeFor(embedded: boolean, small: boolean): number {
  if (embedded) return 64;
  return small ? 84 : 128;
}

export function Hero({ state, embedded }: { state: BreezeState | undefined; embedded?: boolean }) {
  const { theme, layout } = useKit();
  const small = Boolean(embedded) || layout.compact;
  const connectionColor = {
    connected: theme.colors.statusSuccess,
    error: theme.colors.statusDanger,
    connecting: theme.colors.foregroundMuted,
    disconnected: theme.colors.foregroundMuted,
  }[state?.connection.status ?? "disconnected"];

  const frame = useMemo<ViewStyle>(
    () => ({
      overflow: "hidden",
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: alpha(BREEZE.sky, 0.12),
      padding: small ? space.lg : space.xl,
    }),
    [theme, small],
  );
  const eyebrow = useMemo<TextStyle>(
    () => ({
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.4,
      textTransform: "uppercase",
    }),
    [theme],
  );
  const title = useMemo<TextStyle>(
    () => ({
      color: theme.colors.foreground,
      fontSize: small ? 22 : 30,
      fontWeight: "300",
      lineHeight: small ? 28 : 38,
    }),
    [theme, small],
  );
  const lede = useMemo<TextStyle>(
    () => ({ color: theme.colors.foregroundMuted, fontSize: 14, lineHeight: 21, maxWidth: 560 }),
    [theme],
  );
  const pandaSize = pandaSizeFor(Boolean(embedded), small);

  return (
    <View style={frame}>
      <View style={BLOB_TOP} />
      <View style={BLOB_BOTTOM} />
      <View style={BLOB_SUN} />
      <Row gap={small ? space.md : space.xl}>
        <View style={COPY}>
          <Text style={eyebrow}>Mail Breeze</Text>
          <Text accessibilityRole="header" style={title}>
            {greeting()}. {headline(state)}.
          </Text>
          {embedded ? null : (
            <Text style={lede}>
              Eingehende Mails werden zu kleinen Aufgaben für einen Agenten. Mail Breeze schreibt,
              entwirft und sendet nie eine Antwort.
            </Text>
          )}
          <Row wrap gap={space.sm}>
            {STATS.map((status) => {
              const look = statusLook(theme, status);
              return (
                <Pill key={status} look={look} label={`${countOf(state, status)} ${look.label}`} />
              );
            })}
            <Pill label={connectionLabel(state?.connection)} color={connectionColor} icon="Mail" />
          </Row>
        </View>
        <Panda size={pandaSize} />
      </Row>
    </View>
  );
}
