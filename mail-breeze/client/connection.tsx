import { copyText, useToast } from "@getpaseo/plugin/client/react-native";
import { useCallback, useMemo } from "react";
import { Text, View, type TextStyle, type ViewStyle } from "react-native";
import type { BreezeState } from "../shared/contracts";
import type { Breeze, LoginChallenge } from "./api";
import {
  clockTime,
  connectionOwner,
  errorMessage,
  hasDemo,
  hasRetainedLogin,
  liveProvider,
  relativeTime,
} from "./format";
import { GmailCard } from "./gmail";
import {
  Actions,
  Banner,
  Body,
  Button,
  Heading,
  LinkOut,
  Pill,
  Row,
  Stack,
  Surface,
  useKit,
} from "./kit";
import { alpha, BREEZE, radius, space } from "./theme";

const DEMO_TINT = alpha(BREEZE.sun, 0.25);

function LoginCard({ challenge }: { challenge: LoginChallenge }) {
  const { theme } = useKit();
  const toast = useToast();
  const expired = Date.parse(challenge.expiresAt) < Date.now();
  const copy = useCallback(async () => {
    try {
      await copyText(challenge.userCode);
      toast.show("Code kopiert", { variant: "success" });
    } catch (error) {
      toast.error(`Kopieren fehlgeschlagen: ${errorMessage(error)}`);
    }
  }, [challenge.userCode, toast]);
  const box = useMemo<ViewStyle>(
    () => ({
      alignSelf: "flex-start",
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      borderRadius: radius.md,
      backgroundColor: theme.colors.surface0,
      borderWidth: 1,
      borderColor: alpha(BREEZE.sky, 0.6),
    }),
    [theme],
  );
  const code = useMemo<TextStyle>(
    () => ({
      color: theme.colors.foreground,
      fontSize: 26,
      fontWeight: "600",
      letterSpacing: 4,
      fontVariant: ["tabular-nums"],
    }),
    [theme],
  );

  return (
    <Banner
      tone={expired ? "warning" : "info"}
      icon="KeyRound"
      title={expired ? "Der Code ist abgelaufen" : "Schließe die Anmeldung bei Microsoft ab"}
    >
      <Body muted>
        Öffne die Seite, gib den Code ein und melde dich an. Dieses Fenster aktualisiert sich von
        selbst.
      </Body>
      <View style={box}>
        <Text
          selectable
          accessibilityLabel={`Anmeldecode ${challenge.userCode.split("").join(" ")}`}
          style={code}
        >
          {challenge.userCode}
        </Text>
      </View>
      <Row wrap gap={space.md}>
        <Button label="Code kopieren" icon="Copy" onPress={copy} />
        <LinkOut href={challenge.verificationUri}>Microsoft-Anmeldung öffnen</LinkOut>
      </Row>
      <Body muted size={12}>
        Gültig bis {clockTime(challenge.expiresAt)}
      </Body>
    </Banner>
  );
}

function ConnectedBody({ state, breeze }: { state: BreezeState; breeze: Breeze }) {
  const { connection } = state;
  return (
    <Stack>
      <Body>
        Angemeldet als <Body strong>{connection.account ?? "unbekanntem Konto"}</Body>. Zuletzt
        synchronisiert: {relativeTime(connection.lastSyncAt)}.
      </Body>
      <Body muted>
        Neue Outlook-Mails werden automatisch geprüft. Eingefügte Mails startest du selbst.
      </Body>
      <Row wrap gap={space.md}>
        <Button
          label="Jetzt synchronisieren"
          icon="RefreshCw"
          variant="primary"
          busy={breeze.busy === "sync"}
          onPress={breeze.sync}
        />
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

function statusCopy(connecting: boolean, retrying: boolean): string {
  if (retrying) {
    return "Die letzte Synchronisierung ist fehlgeschlagen. Mail Breeze versucht es automatisch erneut, solange die Anmeldung gespeichert ist.";
  }
  if (connecting) {
    return "Outlook ist gerade dabei, sich zu verbinden. Bis dahin erscheinen nur manuell importierte Mails und Demo-Daten.";
  }
  return "Outlook ist nicht verbunden. Ohne Verbindung erscheinen nur manuell importierte Mails und Demo-Daten.";
}

function DisconnectedBody({
  state,
  breeze,
  error,
  onSetup,
}: {
  state: BreezeState;
  breeze: Breeze;
  error?: string;
  onSetup(): void;
}) {
  const { connection } = state;
  const connecting = connection.status === "connecting";
  const retrying = hasRetainedLogin(state);
  const clientIdMissing = state.preferences.clientId.trim() === "";
  const login = useCallback(() => {
    void breeze.beginLogin();
  }, [breeze]);
  const loginLabel = breeze.login || connecting ? "Neuen Code anfordern" : "Mit Outlook anmelden";
  if (clientIdMissing) {
    return (
      <Stack>
        <Banner tone="info" icon="KeyRound" title="Outlook ist noch nicht eingerichtet">
          <Body>
            Mail Breeze braucht eine eigene Microsoft-Verbindung, um neue Mails zu lesen. Deine
            Anmeldung in ChatGPT oder Claude wird nicht automatisch übernommen.
          </Body>
          <Body muted>
            Die einmalige Microsoft-App-Registrierung fehlt noch. Danach kannst du dich mit deinem
            Outlook-Konto anmelden.
          </Body>
          <Actions>
            <Button label="Einrichtung öffnen" icon="Settings" onPress={onSetup} />
          </Actions>
        </Banner>
      </Stack>
    );
  }
  return (
    <Stack>
      <Body muted>{statusCopy(connecting, retrying)}</Body>
      {error ? (
        <Banner tone="danger" icon="TriangleAlert" title="Anmeldung nicht möglich">
          <Body selectable>{errorMessage(error)}</Body>
        </Banner>
      ) : null}
      {breeze.login ? <LoginCard challenge={breeze.login} /> : null}
      {connecting && !breeze.login ? (
        <Banner tone="info" icon="Loader" title="Anmeldung läuft">
          <Body muted>
            Eine Anmeldung wurde gestartet. Den Code zeigt das Gerät, auf dem sie begonnen wurde.
            Starte neu, um hier einen neuen Code zu bekommen.
          </Body>
        </Banner>
      ) : null}
      <Row wrap gap={space.md}>
        <Button
          label={loginLabel}
          icon="LogIn"
          variant="primary"
          busy={breeze.busy === "login"}
          onPress={login}
        />
        {connecting || retrying ? (
          <Button
            label={connecting ? "Abbrechen" : "Trennen"}
            icon={connecting ? undefined : "Unplug"}
            variant="ghost"
            busy={breeze.busy === "disconnect"}
            onPress={breeze.disconnect}
          />
        ) : null}
      </Row>
    </Stack>
  );
}

interface PillLook {
  label: string;
  icon: string;
  color?: string;
}

function connectionPill(
  state: BreezeState["connection"]["status"],
  colors: { ok: string; bad: string },
): PillLook {
  const table: Record<BreezeState["connection"]["status"], PillLook> = {
    connected: { label: "Verbunden", icon: "Check", color: colors.ok },
    connecting: { label: "Verbindet", icon: "Loader" },
    error: { label: "Fehler", icon: "TriangleAlert", color: colors.bad },
    disconnected: { label: "Nicht verbunden", icon: "Unplug" },
  };
  return table[state];
}

function OutlookCard({
  state,
  breeze,
  onSetup,
}: {
  state: BreezeState;
  breeze: Breeze;
  onSetup(): void;
}) {
  const { theme } = useKit();
  const { connection } = state;
  const blocked = liveProvider(connection) === "gmail";
  const owned = !blocked && connectionOwner(connection) !== "gmail";
  const connected = owned && connection.status === "connected";
  const pill = connectionPill(owned ? connection.status : "disconnected", {
    ok: theme.colors.statusSuccess,
    bad: theme.colors.statusDanger,
  });
  let body = (
    <DisconnectedBody
      state={state}
      breeze={breeze}
      error={owned ? connection.error : undefined}
      onSetup={onSetup}
    />
  );
  if (blocked) {
    body = <Body muted>Gmail ist aktiv. Trenne Gmail oben, um Outlook zu verbinden.</Body>;
  } else if (connected) {
    body = <ConnectedBody state={state} breeze={breeze} />;
  }
  return (
    <Surface tone={connected ? "sage" : "plain"}>
      <Row justify="space-between" gap={space.md}>
        <Heading hint="Braucht eine eigene Microsoft-App-Registrierung und die Freigabe deiner Organisation.">
          Outlook
        </Heading>
        <Pill label={pill.label} icon={pill.icon} color={pill.color} />
      </Row>
      {body}
    </Surface>
  );
}

function DemoCard({ state, breeze }: { state: BreezeState; breeze: Breeze }) {
  const { theme } = useKit();
  const demoTasks = state.tasks.filter((task) => task.demo).length;
  const active = hasDemo(state);
  const copy = active
    ? "Diese Aufgaben sind Beispiele und keine echten Mails. Sie tragen überall die Markierung Demo."
    : "Lade ein paar Beispiel-Mails, um Mail Breeze auszuprobieren, ohne Postfach zu verbinden. Alles ist als Demo markiert.";
  return (
    <Surface tone={active ? "sun" : "plain"}>
      <Row justify="space-between" gap={space.md}>
        <Heading>Demo-Daten</Heading>
        {active ? (
          <Pill
            label={`${demoTasks} Beispiele`}
            color={theme.colors.statusWarning}
            tint={DEMO_TINT}
          />
        ) : null}
      </Row>
      <Body muted>{copy}</Body>
      <Actions>
        {active ? (
          <Button
            label="Demo-Daten entfernen"
            icon="Trash2"
            variant="danger"
            busy={breeze.busy === "clear-demo"}
            onPress={breeze.clearDemo}
          />
        ) : (
          <Button
            label="Demo-Daten laden"
            icon="Sparkles"
            busy={breeze.busy === "demo"}
            onPress={breeze.loadDemo}
          />
        )}
      </Actions>
    </Surface>
  );
}

function ImportCard({ onImport }: { onImport(): void }) {
  return (
    <Surface>
      <Heading hint="Füge eine Mail selbst ein, etwa aus dem Postfach kopiert. Sie wird wie eine eingegangene Mail zur Aufgabe.">
        Mail manuell importieren
      </Heading>
      <Row wrap>
        <Button label="Mail einfügen" icon="ClipboardPaste" onPress={onImport} />
      </Row>
    </Surface>
  );
}

export function ConnectionTab({
  state,
  breeze,
  onImport,
  onSetup,
}: {
  state: BreezeState;
  breeze: Breeze;
  onImport(): void;
  onSetup(): void;
}) {
  const { layout } = useKit();
  return (
    <Stack gap={layout.compact ? space.md : space.lg}>
      <GmailCard state={state} breeze={breeze} />
      <OutlookCard state={state} breeze={breeze} onSetup={onSetup} />
      <DemoCard state={state} breeze={breeze} />
      <ImportCard onImport={onImport} />
    </Stack>
  );
}
