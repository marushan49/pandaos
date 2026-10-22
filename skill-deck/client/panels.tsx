import { FlatList, Modal, ScrollView } from "@getpaseo/plugin/client/react-native";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  Text,
  View,
  type ListRenderItemInfo,
  type PressableStateCallbackType,
  type ViewStyle,
} from "react-native";
import type { Skill } from "../shared/contracts.ts";
import type { DeckPlugin } from "../shared/plugins.ts";
import type { DeckModel, Tab } from "./deck.tsx";
import { Findings, SkillContent, SkillLink, updateLabels } from "./skill.tsx";
import { DeckButton, Message, Search, date, type DeckStyles, type Theme } from "./ui.tsx";

const tabs: { id: Tab; label: string }[] = [
  { id: "skills", label: "Skills" },
  { id: "plugins", label: "Plugins" },
  { id: "findings", label: "Hinweise" },
  { id: "usage", label: "Nutzung" },
];
const scopeOptions = [
  { value: "all", label: "Alle Bereiche" },
  { value: "global", label: "Global" },
  { value: "project", label: "Projekt" },
];
const updateOptions = [
  { value: "all", label: "Jeder Update-Status" },
  ...Object.entries(updateLabels).map(([value, label]) => ({ value, label })),
];
const skillKey = (skill: Skill) => skill.id;

function DeckTab({
  item,
  selected,
  theme,
  onSelect,
}: {
  item: (typeof tabs)[number];
  selected: boolean;
  theme: Theme;
  onSelect(tab: Tab): void;
}) {
  const press = useCallback(() => onSelect(item.id), [onSelect, item.id]);
  return <DeckButton theme={theme} label={item.label} selected={selected} onPress={press} />;
}

function UsageRow({
  entry,
  maxCount,
  theme,
  styles,
  onSelect,
}: {
  entry: Skill["usage"][number] & { skill: Skill };
  maxCount: number;
  theme: Theme;
  styles: DeckStyles;
  onSelect(id: string): void;
}) {
  const bar = useMemo<ViewStyle>(
    () => ({
      height: 8,
      width: `${(entry.count / maxCount) * 100}%`,
      backgroundColor: theme.colors.accent,
    }),
    [entry.count, maxCount, theme],
  );
  return (
    <View style={styles.cartridge}>
      <View style={styles.wrap}>
        <Text style={styles.strong}>{entry.skill.name}</Text>
        <Text style={styles.muted}>{entry.provider}</Text>
        <Text style={styles.strong}>Aufrufe: {entry.count}</Text>
      </View>
      <View style={styles.track}>
        <View style={bar} />
      </View>
      <Text style={styles.footer}>Zuletzt {date(entry.lastUsedAt)}</Text>
      <SkillLink
        theme={theme}
        label={`Skill ${entry.skill.name} ansehen`}
        id={entry.skill.id}
        onSelect={onSelect}
      />
    </View>
  );
}

function SkillRow({
  skill,
  index,
  selected,
  theme,
  styles,
  onSelect,
}: {
  skill: Skill;
  index: number;
  selected: boolean;
  theme: Theme;
  styles: DeckStyles;
  onSelect(id: string): void;
}) {
  const [focused, setFocused] = useState(false);
  const c = theme.colors;
  const focus = useCallback(() => setFocused(true), []);
  const blur = useCallback(() => setFocused(false), []);
  const press = useCallback(() => onSelect(skill.id), [onSelect, skill.id]);
  const state = useMemo(() => ({ selected }), [selected]);
  const rowStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => {
      let borderColor = selected ? c.accent : c.border;
      if (focused) borderColor = c.foreground;
      return {
        padding: 14,
        gap: 10,
        borderWidth: 2,
        borderBottomWidth: 4,
        borderRadius: 2,
        borderColor,
        backgroundColor: pressed || selected ? c.surface2 : c.surface1,
      };
    },
    [c, selected, focused],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Skill ${skill.name} öffnen`}
      accessibilityState={state}
      onPress={press}
      onFocus={focus}
      onBlur={blur}
      style={rowStyle}
    >
      <View style={styles.row}>
        <View style={styles.slot}>
          <Text style={styles.slotText}>{String(index + 1).padStart(2, "0")}</Text>
        </View>
        <View style={styles.grow}>
          <Text style={styles.strong}>{skill.name}</Text>
          <Text style={styles.muted}>
            {skill.scopes.includes("project") ? "Projekt" : "Global"}
          </Text>
        </View>
      </View>
      {skill.description ? (
        <Text numberOfLines={2} style={styles.muted}>
          {skill.description}
        </Text>
      ) : null}
      <View style={styles.wrap}>
        <Text style={styles.footer}>{skill.providers.join(", ")}</Text>
        <Text style={styles.footer}>
          {skill.health !== "ok" ? "Datei prüfen" : updateLabels[skill.update.status]}
        </Text>
      </View>
    </Pressable>
  );
}

function PluginRows({ plugins, styles }: { plugins: DeckPlugin[]; styles: DeckStyles }) {
  const status: Record<string, string> = {
    running: "Läuft",
    disabled: "Deaktiviert",
    failed: "Fehler",
    loading: "Lädt",
    stopped: "Gestoppt",
    error: "Fehler",
  };
  return (
    <View style={styles.column}>
      {plugins.map((plugin) => (
        <View style={styles.cartridge} key={plugin.id}>
          <View style={styles.wrap}>
            <Text selectable style={styles.heading}>
              {plugin.name}
            </Text>
            <Text style={styles.muted}>{status[plugin.status] ?? plugin.status}</Text>
          </View>
          {plugin.description ? <Text style={styles.text}>{plugin.description}</Text> : null}
          <Text style={styles.strong}>{plugin.message}</Text>
          <Text selectable style={styles.muted}>
            {plugin.source === "directory" ? "Lokales Verzeichnis" : plugin.source}
            {plugin.revision ? `, ${plugin.revision}` : ""}
          </Text>
          <Text selectable style={styles.footer}>
            {plugin.path}
          </Text>
        </View>
      ))}
    </View>
  );
}

function DeckActions({ model }: { model: DeckModel }) {
  const {
    styles,
    theme,
    tab,
    projectName,
    provider,
    scope,
    updateFilter,
    busy,
    data,
    runUpdates,
    query,
    plugins,
    refresh,
    openFilters,
    updateError,
    search,
    setSearch,
  } = model;
  return (
    <View style={styles.column}>
      <Search theme={theme} value={search} onChange={setSearch} />
      <View style={styles.wrap}>
        {tab !== "plugins" ? (
          <DeckButton
            theme={theme}
            label={
              projectName || provider || scope !== "all" || updateFilter !== "all"
                ? "Filter aktiv"
                : "Projekt & Filter"
            }
            icon="SlidersHorizontal"
            onPress={openFilters}
          />
        ) : null}
        {tab === "skills" || tab === "plugins" ? (
          <DeckButton
            theme={theme}
            label={busy ? "Quellen werden geprüft" : "Updates prüfen"}
            icon="PackageCheck"
            disabled={busy || (tab === "skills" && !data)}
            onPress={runUpdates}
          />
        ) : null}
        <DeckButton
          theme={theme}
          label="Neu einlesen"
          icon="RefreshCw"
          showLabel={false}
          disabled={query.isFetching || plugins.isFetching || busy}
          onPress={refresh}
        />
      </View>
      {updateError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {updateError.message}
        </Text>
      ) : null}
    </View>
  );
}

export function DeckHeader({ model }: { model: DeckModel }) {
  const { compact, tab, selected, styles, projectName, theme, openInfo, changeTab } = model;
  if (compact && tab === "skills" && selected) return null;
  return (
    <>
      <View style={styles.row}>
        <View style={styles.headerLabel}>
          <Text style={styles.title}>Skill Deck</Text>
          {projectName ? <Text style={styles.muted}>{projectName} + globale Skills</Text> : null}
        </View>
        <DeckButton theme={theme} label="Info" icon="Info" showLabel={false} onPress={openInfo} />
      </View>
      <View style={styles.tabRail}>
        {tabs.map((item) => (
          <DeckTab
            key={item.id}
            item={item}
            theme={theme}
            selected={tab === item.id}
            onSelect={changeTab}
          />
        ))}
      </View>
      <DeckActions model={model} />
    </>
  );
}

export function InventoryStatus({ model }: { model: DeckModel }) {
  const { tab, query, styles, theme, reloadInventory } = model;
  if (tab === "plugins") return null;
  return (
    <>
      {query.isPending ? (
        <Message
          styles={styles}
          title="Skill-Verzeichnisse werden gelesen"
          text="Globale Quellen und das gewählte Projekt werden geprüft."
        />
      ) : null}
      {query.error ? (
        <View style={styles.column}>
          <Text accessibilityRole="alert" style={styles.error}>
            {query.error.message}
          </Text>
          <DeckButton theme={theme} label="Inventar erneut laden" onPress={reloadInventory} />
        </View>
      ) : null}
    </>
  );
}

function SkillsPane({ model }: { model: DeckModel }) {
  const {
    data,
    compact,
    selected,
    skills,
    styles,
    theme,
    search,
    provider,
    scope,
    updateFilter,
    setSelectedId,
    workspaceId,
    host,
    back,
    projectName,
  } = model;
  const selectedId = selected?.id;
  const renderSkill = useCallback(
    ({ item, index }: ListRenderItemInfo<Skill>) => (
      <SkillRow
        skill={item}
        index={index}
        selected={selectedId === item.id}
        theme={theme}
        styles={styles}
        onSelect={setSelectedId}
      />
    ),
    [selectedId, theme, styles, setSelectedId],
  );
  const filtered = Boolean(search || provider || scope !== "all" || updateFilter !== "all");
  const empty = useMemo(
    () => (
      <Message
        styles={styles}
        title={filtered ? "Kein passendes Modul" : "Noch keine Skills gefunden"}
        text={
          filtered
            ? "Suche oder Filter ändern."
            : "Wähle ein Projekt mit Skills oder lies die Verzeichnisse erneut ein."
        }
      />
    ),
    [styles, filtered],
  );
  if (!data) return null;
  return (
    <>
      {!(compact && selected) ? (
        <Text
          style={styles.footer}
        >{`${skills.length} von ${data.skills.length} Modulen  /  ${projectName ?? "Global"}`}</Text>
      ) : null}
      <View style={styles.body}>
        {!compact || !selected ? (
          <FlatList
            style={styles.list}
            contentContainerStyle={styles.listContent}
            data={skills}
            keyExtractor={skillKey}
            renderItem={renderSkill}
            ListEmptyComponent={empty}
          />
        ) : null}
        {selected ? (
          <SkillContent
            key={selected.id}
            skill={selected}
            workspaceId={workspaceId || undefined}
            hostId={host.id}
            theme={theme}
            styles={styles}
            compact={compact}
            onBack={back}
          />
        ) : null}
      </View>
    </>
  );
}

function PluginsPane({ model }: { model: DeckModel }) {
  const { styles, plugins, theme, reloadPlugins, visiblePlugins, host } = model;
  return (
    <ScrollView style={styles.grow} contentContainerStyle={styles.listContent}>
      {plugins.isPending ? <Message styles={styles} title="Plugins werden geladen" /> : null}
      {plugins.error ? (
        <View style={styles.column}>
          <Text accessibilityRole="alert" style={styles.error}>
            {plugins.error.message}
          </Text>
          <DeckButton theme={theme} label="Plugins erneut laden" onPress={reloadPlugins} />
        </View>
      ) : null}
      {plugins.data ? (
        <>
          <Text style={styles.footer}>
            {visiblePlugins.length} installierte Plugins auf {host.label}
          </Text>
          <PluginRows plugins={visiblePlugins} styles={styles} />
          {!visiblePlugins.length ? (
            <Message
              styles={styles}
              title="Keine passenden Plugins"
              text="Suche ändern oder Plugins in den Host-Einstellungen installieren."
            />
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function FindingsPane({ model }: { model: DeckModel }) {
  const { data, styles, findings, theme, openSkill } = model;
  if (!data) return null;
  return (
    <ScrollView style={styles.grow} contentContainerStyle={styles.listContent}>
      <Text style={styles.muted}>
        Fundstellen vergleichen. Ähnliche Aufgaben beweisen keinen Widerspruch.
      </Text>
      <Findings
        findings={findings}
        skills={data.skills}
        theme={theme}
        styles={styles}
        onSelect={openSkill}
      />
      {!findings.length ? (
        <Message
          styles={styles}
          title="Keine passenden Hinweise"
          text="Das ist keine vollständige Prüfung aller Regeln auf Widersprüche."
        />
      ) : null}
    </ScrollView>
  );
}

function UsagePane({ model }: { model: DeckModel }) {
  const { data, styles, usage, maxCount, theme, openSkill } = model;
  if (!data) return null;
  return (
    <ScrollView style={styles.grow} contentContainerStyle={styles.listContent}>
      <View style={styles.column}>
        <Text style={styles.heading}>Beobachtete Aufrufe</Text>
        <Text style={styles.muted}>
          {data.observation.active
            ? `Seit ${date(data.observation.since)}. Automatisch geladene Skills können fehlen.`
            : "Beobachtung auf diesem Host nicht aktiv. Details unter Info."}
        </Text>
      </View>
      {!usage.length ? (
        <Message
          styles={styles}
          title="Noch keine Aufrufe erfasst"
          text="Erkannte Skill-Aufrufe und direkte Lesezugriffe erscheinen hier nach Provider."
        />
      ) : null}
      {usage.map((entry) => (
        <UsageRow
          key={`${entry.skill.id}:${entry.provider}`}
          entry={entry}
          maxCount={maxCount}
          styles={styles}
          theme={theme}
          onSelect={openSkill}
        />
      ))}
    </ScrollView>
  );
}

export function DeckPane({ model }: { model: DeckModel }) {
  switch (model.tab) {
    case "skills":
      return <SkillsPane model={model} />;
    case "plugins":
      return <PluginsPane model={model} />;
    case "findings":
      return <FindingsPane model={model} />;
    case "usage":
      return <UsagePane model={model} />;
  }
}

export function DeckFooter({ model }: { model: DeckModel }) {
  const { data, compact, tab, selected, plugins, styles } = model;
  if (!data || (compact && tab === "skills" && selected)) return null;
  return (
    <Text style={styles.footer}>
      {`Eingelesen ${date(tab === "plugins" ? (plugins.data?.scannedAt ?? null) : data.scannedAt)}`}
      {data.warnings.length ? `, ${data.warnings.length} Scan-Hinweise unter Info` : ""}
    </Text>
  );
}

export function DeckFilters({ model }: { model: DeckModel }) {
  const {
    filters,
    setFilters,
    workspaceId,
    projectOptions,
    changeWorkspace,
    scope,
    setScope,
    provider,
    providerOptions,
    setProvider,
    updateFilter,
    setUpdateFilter,
    theme,
    closeFilters,
  } = model;
  return (
    <Modal title="Projekt & Filter" open={filters} onOpenChange={setFilters}>
      <Modal.Content>
        <SettingsSelect
          label="Projekt"
          value={workspaceId}
          options={projectOptions}
          onValueChange={changeWorkspace}
        />
        <SettingsSelect
          label="Bereich"
          value={scope}
          options={scopeOptions}
          onValueChange={setScope}
        />
        <SettingsSelect
          label="Providerpfad"
          value={provider}
          options={providerOptions}
          onValueChange={setProvider}
        />
        <SettingsSelect
          label="Update-Status"
          value={updateFilter}
          options={updateOptions}
          onValueChange={setUpdateFilter}
        />
        <DeckButton theme={theme} label="Auswahl anzeigen" onPress={closeFilters} />
      </Modal.Content>
    </Modal>
  );
}

export function DeckInfo({ model }: { model: DeckModel }) {
  const { info, setInfo, styles, data, theme, closeInfo } = model;
  return (
    <Modal title="Quellen & Grenzen" open={info} onOpenChange={setInfo}>
      <Modal.Content>
        <View style={styles.column}>
          <Text style={styles.text}>
            Der Hostwechsel oben bestimmt alle Daten. Jeder Host braucht das Plugin.
          </Text>
          <Text style={styles.text}>
            Updates werden nur geprüft. Änderungen an einer Git-Quelle bedeuten nicht automatisch
            Änderungen an jedem Skill.
          </Text>
          <Text style={styles.text}>
            {data?.observation.limitation ??
              "Es werden nur erkannte Skill-Aufrufe und Datei-Lesezugriffe beobachtet."}
          </Text>
          <Text style={styles.text}>
            Providerpfade zeigen die Ablage. Welche Skills eine einzelne Session tatsächlich geladen
            hat, ist damit nicht belegt.
          </Text>
          {data?.warnings.map((warning) => (
            <Text selectable key={warning} style={styles.muted}>
              {warning}
            </Text>
          ))}
          <DeckButton theme={theme} label="Schließen" onPress={closeInfo} />
        </View>
      </Modal.Content>
    </Modal>
  );
}
