import { Icon } from "@getpaseo/plugin/client/react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { View, type ViewStyle } from "react-native";
import { PreferencesSchema, type Preferences } from "../shared/contracts";
import type { Breeze } from "./api";
import { Body, Button, Field, Heading, Row, Stack, Surface, useKit } from "./kit";
import { space } from "./theme";

interface DraftPerson {
  key: string;
  name: string;
  email: string;
  role: string;
}

interface Draft {
  clientId: string;
  tenant: string;
  projectDirectory: string;
  context: string;
  importance: string;
  people: DraftPerson[];
}

const NO_ERRORS: Record<string, string> = {};
let keyCounter = 0;
const nextKey = () => {
  keyCounter += 1;
  return `person-${keyCounter}`;
};

function toDraft(preferences: Preferences): Draft {
  return {
    clientId: preferences.clientId,
    tenant: preferences.tenant,
    projectDirectory: preferences.projectDirectory,
    context: preferences.context,
    importance: preferences.importance,
    people: preferences.people.map((person) => ({ key: nextKey(), ...person })),
  };
}

function toInput(draft: Draft) {
  return {
    clientId: draft.clientId,
    tenant: draft.tenant,
    projectDirectory: draft.projectDirectory,
    context: draft.context,
    importance: draft.importance,
    people: draft.people.map(({ name, email, role }) => ({ name, email, role })),
  };
}

const FIELD_MESSAGES: Record<string, string> = {
  email: "Bitte eine gültige E-Mail-Adresse eingeben.",
  name: "Der Name darf nicht leer sein.",
  tenant: "Nur Buchstaben, Ziffern, Punkt und Bindestrich.",
};

function issueMap(draft: Draft): Record<string, string> {
  const parsed = PreferencesSchema.safeParse(toInput(draft));
  if (parsed.success) return {};
  const out: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".");
    const field = String(issue.path[issue.path.length - 1] ?? "");
    out[key] ??= FIELD_MESSAGES[field] ?? "Eingabe ist ungültig.";
  }
  return out;
}

interface PersonPatch {
  name?: string;
  email?: string;
  role?: string;
}

function PersonEditor({
  person,
  nameError,
  emailError,
  roleError,
  onChange,
  onRemove,
}: {
  person: DraftPerson;
  nameError?: string;
  emailError?: string;
  roleError?: string;
  onChange(key: string, patch: PersonPatch): void;
  onRemove(key: string): void;
}) {
  const { theme } = useKit();
  const { key } = person;
  const box = useMemo<ViewStyle>(
    () => ({
      gap: space.sm,
      padding: space.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface0,
    }),
    [theme],
  );
  const setName = useCallback((value: string) => onChange(key, { name: value }), [onChange, key]);
  const setEmail = useCallback((value: string) => onChange(key, { email: value }), [onChange, key]);
  const setRole = useCallback((value: string) => onChange(key, { role: value }), [onChange, key]);
  const remove = useCallback(() => onRemove(key), [onRemove, key]);
  return (
    <View style={box}>
      <Field label="Name" value={person.name} onChangeText={setName} error={nameError} />
      <Field
        label="E-Mail"
        value={person.email}
        onChangeText={setEmail}
        error={emailError}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Field
        label="Rolle und Hinweise"
        value={person.role}
        onChangeText={setRole}
        error={roleError}
        placeholder="Kundin, Projektleitung, Rechnungen ..."
      />
      <Row>
        <Button
          label="Person entfernen"
          icon="Trash2"
          variant="danger"
          accessibilityLabel={`Person ${person.name || "ohne Namen"} entfernen`}
          onPress={remove}
        />
      </Row>
    </View>
  );
}

function PeopleSection({
  draft,
  errors,
  onChange,
  onRemove,
  onAdd,
}: {
  draft: Draft;
  errors: Record<string, string>;
  onChange(key: string, patch: PersonPatch): void;
  onRemove(key: string): void;
  onAdd(): void;
}) {
  return (
    <Surface>
      <Heading hint="Wichtige Absender mit Rolle, damit der Agent Mails richtig einordnet.">
        Personen
      </Heading>
      {draft.people.length === 0 ? <Body muted>Noch niemand hinterlegt.</Body> : null}
      {draft.people.map((person, index) => (
        <PersonEditor
          key={person.key}
          person={person}
          nameError={errors[`people.${index}.name`]}
          emailError={errors[`people.${index}.email`]}
          roleError={errors[`people.${index}.role`]}
          onChange={onChange}
          onRemove={onRemove}
        />
      ))}
      <Row>
        <Button
          label="Person hinzufügen"
          icon="UserPlus"
          disabled={draft.people.length >= 100}
          onPress={onAdd}
        />
      </Row>
    </Surface>
  );
}

export function PreferencesTab({
  preferences,
  breeze,
}: {
  preferences: Preferences;
  breeze: Breeze;
}) {
  const { theme, layout } = useKit();
  const [draft, setDraft] = useState<Draft>(() => toDraft(preferences));
  const [attempted, setAttempted] = useState(false);
  const serialized = JSON.stringify(preferences);
  const dirty = JSON.stringify(toInput(draft)) !== serialized;
  const { savePreferences } = breeze;

  useEffect(() => {
    setDraft((current) =>
      JSON.stringify(toInput(current)) === serialized ? current : toDraft(preferences),
    );
  }, [serialized, preferences]);

  const errors = attempted ? issueMap(draft) : NO_ERRORS;
  const patch = useCallback((next: Partial<Draft>) => {
    setDraft((current) => Object.assign({}, current, next));
  }, []);
  const setDirectory = useCallback((value: string) => patch({ projectDirectory: value }), [patch]);
  const setContext = useCallback((value: string) => patch({ context: value }), [patch]);
  const setImportance = useCallback((value: string) => patch({ importance: value }), [patch]);
  const setClientId = useCallback((value: string) => patch({ clientId: value }), [patch]);
  const setTenant = useCallback((value: string) => patch({ tenant: value }), [patch]);
  const changePerson = useCallback((key: string, next: PersonPatch) => {
    setDraft((current) =>
      Object.assign({}, current, {
        people: current.people.map((person) =>
          person.key === key ? Object.assign({}, person, next) : person,
        ),
      }),
    );
  }, []);
  const removePerson = useCallback((key: string) => {
    setDraft((current) =>
      Object.assign({}, current, { people: current.people.filter((person) => person.key !== key) }),
    );
  }, []);
  const addPerson = useCallback(() => {
    setDraft((current) =>
      Object.assign({}, current, {
        people: current.people.concat({ key: nextKey(), name: "", email: "", role: "" }),
      }),
    );
  }, []);
  const save = useCallback(() => {
    setAttempted(true);
    const parsed = PreferencesSchema.safeParse(toInput(draft));
    if (parsed.success) savePreferences(parsed.data, () => setAttempted(false));
  }, [draft, savePreferences]);
  const reset = useCallback(() => {
    setDraft(toDraft(preferences));
    setAttempted(false);
  }, [preferences]);

  return (
    <Stack gap={layout.compact ? space.md : space.lg}>
      <Surface>
        <Row gap={space.sm}>
          <Icon name="KeyRound" size={16} color={theme.colors.foregroundMuted} />
          <Heading hint="Für die erste Verbindung muss Mail Breeze einmal bei Microsoft als eigene Anwendung registriert werden. Danach meldest du dich im Tab Postfach an.">
            Outlook einrichten
          </Heading>
        </Row>
        <Body muted>
          Eine Anmeldung in ChatGPT oder Claude ersetzt diese Einrichtung nicht. Es werden nur
          Leserechte für Mails angefordert.
        </Body>
        <Field
          label="Client-ID"
          value={draft.clientId}
          onChangeText={setClientId}
          error={errors.clientId}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="00000000-0000-0000-0000-000000000000"
          hint="Anwendungs-ID aus der Microsoft-Entra-App-Registrierung."
        />
        <Field
          label="Mandant"
          value={draft.tenant}
          onChangeText={setTenant}
          error={errors.tenant}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="common"
          hint="common, organizations, consumers oder eine Mandanten-ID."
        />
      </Surface>
      <Surface>
        <Heading hint="GPT-6 Luna ordnet neue Mails nach diesen Regeln ein. Deine Regeln haben Vorrang vor den Standardregeln.">
          Was ist für dich wichtig?
        </Heading>
        <Field
          label="Wichtigkeitsregeln"
          value={draft.importance}
          onChangeText={setImportance}
          error={errors.importance}
          multiline
          numberOfLines={5}
          minHeight={110}
          placeholder={
            "Terminerinnerungen sind wichtig.\nVersandbestätigungen sind unwichtig.\nAlles von lwmc-uk.org ist wichtig."
          }
          hint={`${draft.importance.length} von 4000 Zeichen. Ohne Regeln gilt: wichtig ist, was du tun, entscheiden oder fristgerecht erledigen musst.`}
        />
      </Surface>
      <Surface>
        <Heading hint="Der Agent liest dieses Wissen bei jeder Aufgabe. So erkennt er Absender, Rollen und den passenden Projektordner.">
          Kontext für den Agenten
        </Heading>
        <Field
          label="Projektordner"
          value={draft.projectDirectory}
          onChangeText={setDirectory}
          error={errors.projectDirectory}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="/home/admin/projects/mein-projekt"
          hint="Absoluter Pfad auf dem Host, in dem der Agent arbeitet."
        />
        <Field
          label="Hintergrund und Regeln"
          value={draft.context}
          onChangeText={setContext}
          error={errors.context}
          multiline
          numberOfLines={7}
          minHeight={140}
          placeholder="Wer bin ich, welche Projekte laufen, was soll mit Mails passieren?"
          hint={`${draft.context.length} von 12000 Zeichen`}
        />
      </Surface>

      <PeopleSection
        draft={draft}
        errors={errors}
        onChange={changePerson}
        onRemove={removePerson}
        onAdd={addPerson}
      />

      <Row wrap gap={space.md}>
        <Button
          label="Speichern"
          icon="Save"
          variant="primary"
          disabled={!dirty}
          busy={breeze.busy === "preferences"}
          onPress={save}
        />
        <Button label="Zurücksetzen" variant="ghost" disabled={!dirty} onPress={reset} />
        {dirty ? (
          <Body muted size={13}>
            Ungespeicherte Änderungen
          </Body>
        ) : null}
      </Row>
    </Stack>
  );
}
