import { useRpc } from "@getpaseo/plugin/client";
import { ScrollView, copyText, useToast } from "@getpaseo/plugin/client/react-native";
import { ExternalLink } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { Text, View } from "react-native";
import { skillDetail, type Finding, type Skill } from "../shared/contracts.ts";
import { DeckButton, Message, date, type DeckStyles, type Theme } from "./ui.tsx";

export const updateLabels = {
  unchecked: "Nicht geprüft",
  current: "Aktuell",
  available: "Änderung an der Quelle",
  unknown: "Quelle offen",
  error: "Prüfung fehlgeschlagen",
};

export function SkillLink({
  id,
  label,
  onSelect,
  theme,
}: {
  id: string;
  label: string;
  onSelect(id: string): void;
  theme: Theme;
}) {
  const press = useCallback(() => onSelect(id), [id, onSelect]);
  return <DeckButton theme={theme} label={label} onPress={press} />;
}

export function Findings({
  findings,
  skills,
  theme,
  styles,
  onSelect,
}: {
  findings: Finding[];
  skills: Skill[];
  theme: Theme;
  styles: DeckStyles;
  onSelect(id: string): void;
}) {
  return (
    <View style={styles.column}>
      {findings.map((finding) => (
        <View key={finding.id} style={styles.cartridge}>
          <Text style={styles.muted}>
            {finding.certainty === "verified" ? "Belegter Befund" : "Mögliche Überschneidung"}
          </Text>
          <Text style={styles.strong}>{finding.title}</Text>
          {finding.evidence.map((evidence) => (
            <Text selectable key={evidence} style={styles.muted}>
              {evidence}
            </Text>
          ))}
          <View style={styles.wrap}>
            {finding.skillIds.map((id) => (
              <SkillLink
                key={id}
                id={id}
                theme={theme}
                label={skills.find((skill) => skill.id === id)?.name ?? "Skill öffnen"}
                onSelect={onSelect}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export function SkillContent({
  skill,
  workspaceId,
  hostId,
  theme,
  styles,
  compact,
  onBack,
}: {
  skill: Skill;
  workspaceId?: string;
  hostId: string;
  theme: Theme;
  styles: DeckStyles;
  compact: boolean;
  onBack(): void;
}) {
  const read = useRpc(skillDetail);
  const toast = useToast();
  const detail = useQuery({
    queryKey: [
      "skill-deck",
      hostId,
      workspaceId ?? "global",
      "detail",
      skill.id,
      skill.contentHash,
    ],
    queryFn: () => read({ id: skill.id, workspaceId }),
    retry: false,
  });
  const copy = useCallback(async () => {
    if (detail.data?.content == null) return;
    try {
      await copyText(detail.data.content);
      toast.show("Skill-Inhalt kopiert");
    } catch {
      toast.error("Kopieren fehlgeschlagen");
    }
  }, [detail.data?.content, toast]);
  const { refetch } = detail;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);
  return (
    <ScrollView style={styles.detail} contentContainerStyle={styles.detailContent}>
      {compact ? (
        <DeckButton theme={theme} label="Zurück zur Bibliothek" icon="ArrowLeft" onPress={onBack} />
      ) : null}
      <View style={styles.column}>
        <Text style={styles.muted}>
          {skill.scopes.map((scope) => (scope === "global" ? "Global" : "Projekt")).join(", ")}
        </Text>
        <Text selectable style={styles.heading}>
          {skill.name}
        </Text>
        {skill.description ? (
          <Text selectable style={styles.text}>
            {skill.description}
          </Text>
        ) : null}
        <Text style={styles.muted}>{skill.providers.join(", ")}</Text>
      </View>
      <View style={styles.column}>
        <Text style={styles.strong}>Quelle & Version</Text>
        <Text selectable style={styles.text}>
          {skill.source.label}
        </Text>
        {skill.source.revision ? (
          <Text selectable style={styles.muted}>
            {skill.source.revision}
          </Text>
        ) : null}
        {skill.source.url && /^https?:\/\//.test(skill.source.url) ? (
          <ExternalLink href={skill.source.url}>
            <Text style={styles.text}>Quelle öffnen</Text>
          </ExternalLink>
        ) : null}
        <Text style={styles.strong}>{updateLabels[skill.update.status]}</Text>
        <Text style={styles.muted}>{skill.update.message}</Text>
        {skill.update.checkedAt ? (
          <Text style={styles.footer}>Geprüft {date(skill.update.checkedAt)}</Text>
        ) : null}
      </View>
      <View style={styles.column}>
        <Text style={styles.strong}>Dateipfade</Text>
        {skill.paths.map((path) => (
          <Text selectable key={path} style={styles.muted}>
            {path}
          </Text>
        ))}
        {skill.paths.length > 1 ? (
          <Text style={styles.footer}>Gemeinsame Datei, mehrere Zugänge.</Text>
        ) : null}
      </View>
      {detail.data?.findings.length ? (
        <View style={styles.column}>
          <Text style={styles.strong}>Hinweise zu diesem Skill</Text>
          {detail.data.findings.map((finding) => (
            <View key={finding.id} style={styles.evidence}>
              <Text style={styles.strong}>{finding.title}</Text>
              {finding.evidence.map((evidence) => (
                <Text selectable key={evidence} style={styles.muted}>
                  {evidence}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.column}>
        <View style={styles.wrap}>
          <Text style={styles.strong}>SKILL.md</Text>
          <DeckButton
            theme={theme}
            label="Inhalt kopieren"
            icon="Copy"
            disabled={detail.data?.content == null}
            onPress={copy}
          />
        </View>
        {detail.isPending ? <Message styles={styles} title="Skill wird gelesen" /> : null}
        {detail.error ? (
          <View style={styles.column}>
            <Text accessibilityRole="alert" style={styles.error}>
              {detail.error.message}
            </Text>
            <DeckButton theme={theme} label="Erneut lesen" onPress={retry} />
          </View>
        ) : null}
        {detail.data ? (
          <Text selectable style={styles.text}>
            {detail.data.content ?? "Diese Datei konnte nicht gelesen werden."}
          </Text>
        ) : null}
        {detail.data?.truncated ? (
          <Text style={styles.muted}>
            Vorschau gekürzt. Den vollständigen Inhalt findest du unter dem Dateipfad.
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}
