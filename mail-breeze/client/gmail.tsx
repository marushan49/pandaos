import { useCallback, useMemo, useState } from "react";
import { View, type ViewStyle } from "react-native";
import type { BreezeState } from "../shared/contracts";
import type { Breeze } from "./api";
import { liveProvider, relativeTime, untilTime } from "./format";
import {
  Actions,
  Banner,
  Body,
  Button,
  Field,
  Heading,
  Pill,
  Row,
  Stack,
  Surface,
  useKit,
} from "./kit";
import { alpha, BREEZE, space } from "./theme";

export const DEFAULT_GMAIL_ACCOUNT = "marushan49@gmail.com";
export const DEFAULT_GMAIL_QUERY = "in:inbox -category:promotions -category:social";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FACT: ViewStyle = { flexShrink: 1, minWidth: 140, gap: 2 };
const READING_TINT = alpha(BREEZE.mint, 0.22);

type Connection = BreezeState["connection"];

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={FACT}>
      <Body muted size={12}>
        {label}
      </Body>
      <Body selectable>{value}</Body>
    </View>
  );
}

function ReaderPill({ reader }: { reader: NonNullable<Connection["reader"]> }) {
  const { theme } = useKit();
  if (reader.status === "reading") {
    return <Pill label="Liest gerade" icon="Wind" color={BREEZE.mint} tint={READING_TINT} />;
  }
  if (reader.status === "error") {
    return <Pill label="Fehler" icon="TriangleAlert" color={theme.colors.statusDanger} />;
  }
  return <Pill label="Bereit" icon="Check" color={theme.colors.statusSuccess} />;
}

function PrivacyNote({ viaAgent }: { viaAgent: boolean }) {
  return (
    <Banner tone="info" icon="ShieldCheck" title="So ist Gmail angebunden">
      <Body muted size={13}>
        Mail Breeze nutzt den bereits verbundenen Gmail-Zugang deines Codex-Business-Profils. Es
        gibt keine neue Anmeldung und kein Passwort.
      </Body>
      {viaAgent ? (
        <Body muted size={13}>
          Mailtexte werden von einem Leseagenten (OpenAI) gelesen und vom Aufgabenagenten
          (Anthropic) bearbeitet. Jeder Lauf verbraucht Codex-Kontingent. Eine technische Sperre auf
          Lesen ist nicht belegt.
        </Body>
      ) : (
        <Body muted size={13}>
          Gmail wird über die verbundene Codex-App von OpenAI gelesen, ohne KI-Modellaufruf beim
          Abruf. Aufgaben bearbeitet Claude (Anthropic).
        </Body>
      )}
      <Body muted size={13}>
        Trennen stoppt nur Mail Breeze, importierte Aufgaben bleiben.
      </Body>
    </Banner>
  );
}

function GmailForm({
  breeze,
  initialAccount,
  initialQuery,
  error,
}: {
  breeze: Breeze;
  initialAccount: string;
  initialQuery: string;
  error?: string;
}) {
  const [account, setAccount] = useState(initialAccount);
  const [query, setQuery] = useState(initialQuery);
  const [attempted, setAttempted] = useState(false);
  const { connectGmail } = breeze;
  const accountError =
    attempted && !EMAIL_PATTERN.test(account.trim())
      ? "Bitte eine gültige Gmail-Adresse eingeben."
      : undefined;
  const queryError =
    attempted && query.trim() === "" ? "Die Suche darf nicht leer sein." : undefined;

  const submit = useCallback(() => {
    setAttempted(true);
    const input = { account: account.trim(), query: query.trim() };
    if (EMAIL_PATTERN.test(input.account) && input.query !== "") connectGmail(input);
  }, [account, query, connectGmail]);

  return (
    <Stack>
      {error ? (
        <Banner tone="danger" icon="TriangleAlert" title="Gmail konnte nicht verbunden werden">
          <Body selectable>{error}</Body>
        </Banner>
      ) : null}
      <Field
        label="Gmail-Konto"
        value={account}
        onChangeText={setAccount}
        error={accountError}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        hint="Das Konto, in das deine Outlook-Mails weitergeleitet werden."
      />
      <Field
        label="Gmail-Suche"
        value={query}
        onChangeText={setQuery}
        error={queryError}
        autoCapitalize="none"
        autoCorrect={false}
        hint="Nur neue Mails ab der Verbindung, die zu dieser Suche passen. Mails, die nicht passen, werden nicht gelesen."
      />
      <Actions>
        <Button
          label="Gmail verbinden"
          icon="Mail"
          variant="primary"
          busy={breeze.busy === "gmail"}
          onPress={submit}
        />
      </Actions>
    </Stack>
  );
}

function GmailLive({ state, breeze }: { state: BreezeState; breeze: Breeze }) {
  const { navigation } = useKit();
  const { connection } = state;
  const reader = connection.reader;
  const agentId = reader?.agentId;
  const openReader = useCallback(() => {
    if (agentId) navigation?.openAgent({ agentId });
  }, [navigation, agentId]);
  const reading = reader?.status === "reading";
  const nextRun = useMemo(() => untilTime(reader?.nextReadAt), [reader?.nextReadAt]);

  return (
    <Stack>
      <Body>
        Verbunden mit <Body strong>{connection.account ?? "unbekanntem Konto"}</Body>. Neue Mails
        werden automatisch geprüft. Eingefügte Mails startest du selbst.
      </Body>
      <Row wrap gap={space.xl} align="flex-start">
        <Fact
          label={agentId ? "Leseagent" : "Gmail-Zugang"}
          value={reading ? "liest gerade" : "wartet auf den nächsten Lauf"}
        />
        <Fact label="Zuletzt gelesen" value={relativeTime(connection.lastSyncAt)} />
        <Fact label="Nächster Lauf" value={reading ? "läuft jetzt" : nextRun} />
      </Row>
      {reader ? <Fact label="Suche" value={reader.query} /> : null}
      {connection.error ? (
        <Banner tone="danger" icon="TriangleAlert" title="Der letzte Lauf ist fehlgeschlagen">
          <Body selectable>{connection.error}</Body>
        </Banner>
      ) : null}
      <Body muted size={13}>
        Alle 5 Minuten. Bleibt das Postfach leer, werden die Abstände länger (10, dann 20 Minuten).
      </Body>
      <Row wrap gap={space.md}>
        <Button
          label="Jetzt lesen"
          icon="RefreshCw"
          variant="primary"
          busy={breeze.busy === "sync"}
          disabled={reading}
          onPress={breeze.sync}
        />
        {agentId && navigation ? (
          <Button label="Leseagent öffnen" icon="Bot" onPress={openReader} />
        ) : null}
        <Button
          label="Trennen"
          icon="Unplug"
          variant="ghost"
          busy={breeze.busy === "disconnect"}
          onPress={breeze.disconnect}
        />
      </Row>
    </Stack>
  );
}

function GmailConnecting({ breeze }: { breeze: Breeze }) {
  return (
    <Stack>
      <Banner tone="info" icon="Loader" title="Der Gmail-Zugang wird geprüft">
        <Body muted>
          Das kann einen Moment dauern. Dabei wird nur das Gmail-Profil gelesen, noch keine Mails.
        </Body>
      </Banner>
      <Actions>
        <Button
          label="Abbrechen"
          variant="ghost"
          busy={breeze.busy === "disconnect"}
          onPress={breeze.disconnect}
        />
      </Actions>
    </Stack>
  );
}

function statusPill(connection: Connection, owned: boolean): { label: string; icon: string } {
  if (!owned) return { label: "Nicht verbunden", icon: "Unplug" };
  const table = {
    connected: { label: "Verbunden", icon: "Check" },
    connecting: { label: "Verbindet", icon: "Loader" },
    error: { label: "Fehler", icon: "TriangleAlert" },
    disconnected: { label: "Nicht verbunden", icon: "Unplug" },
  };
  return table[connection.status];
}

export function GmailCard({ state, breeze }: { state: BreezeState; breeze: Breeze }) {
  const { theme } = useKit();
  const { connection } = state;
  const live = liveProvider(connection);
  const owned = live === "gmail";
  const blocked = live === "outlook";
  const pill = statusPill(connection, owned);
  const connected = owned && connection.status !== "connecting";
  const failed = connection.provider === "gmail" && !owned ? connection.error : undefined;
  const pillColor =
    owned && connection.status === "connected" ? theme.colors.statusSuccess : undefined;
  const formQuery = connection.reader?.query ?? DEFAULT_GMAIL_QUERY;
  const formAccount = connection.account ?? DEFAULT_GMAIL_ACCOUNT;

  let body = (
    <GmailForm
      breeze={breeze}
      initialAccount={formAccount}
      initialQuery={formQuery}
      error={failed}
    />
  );
  if (blocked) {
    body = <Body muted>Outlook ist aktiv. Trenne Outlook unten, um Gmail zu verbinden.</Body>;
  } else if (owned && connection.status === "connecting") {
    body = <GmailConnecting breeze={breeze} />;
  } else if (connected) {
    body = <GmailLive state={state} breeze={breeze} />;
  }

  return (
    <Surface tone={connected && connection.status === "connected" ? "sage" : "plain"}>
      <Row justify="space-between" gap={space.md}>
        <Heading hint="Für Mails, die in dieses Konto weitergeleitet werden.">Gmail</Heading>
        <Row gap={space.sm}>
          {connected && connection.reader ? <ReaderPill reader={connection.reader} /> : null}
          <Pill label={pill.label} icon={pill.icon} color={pillColor} />
        </Row>
      </Row>
      <PrivacyNote viaAgent={Boolean(connection.reader?.agentId)} />
      {body}
    </Surface>
  );
}
