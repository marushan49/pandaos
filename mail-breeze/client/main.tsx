import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import type { BreezeState } from "../shared/contracts";
import { useBreeze, type Breeze } from "./api";
import { ConnectionTab } from "./connection";
import { hasDemo, isActive, sortTasks, type FilterKey } from "./format";
import { Hero } from "./hero";
import { ImportModal } from "./import-modal";
import {
  Actions,
  Banner,
  Body,
  Button,
  Chip,
  KitProvider,
  Row,
  Stack,
  useKit,
  type KitValue,
} from "./kit";
import { useBreezeNotices } from "./notices";
import { PreferencesTab } from "./preferences";
import { EmptyTasks, FilterBar, TaskDetail, TaskList, visibleTasks } from "./tasks";
import { space } from "./theme";

type Tab = "tasks" | "mailbox" | "settings";

export interface BreezeAppProps extends KitValue {
  params?: Readonly<Record<string, string>>;
  mode: "screen" | "panel";
}

const SPLIT: ViewStyle = { flex: 1, minHeight: 0, flexDirection: "row", gap: space.lg };
const LIST_PANE: ViewStyle = { width: 400, flexGrow: 0, flexShrink: 0 };
const DETAIL_PANE: ViewStyle = { flex: 1, minWidth: 0 };
const PANE_CONTENT: ViewStyle = { paddingBottom: space.xl };
const LOADING: ViewStyle = { alignItems: "center", gap: space.md, paddingVertical: space.xxl };

function Tabs({
  tab,
  activeCount,
  onChange,
}: {
  tab: Tab;
  activeCount: number;
  onChange(next: Tab): void;
}) {
  const showTasks = useCallback(() => onChange("tasks"), [onChange]);
  const showMailbox = useCallback(() => onChange("mailbox"), [onChange]);
  const showSettings = useCallback(() => onChange("settings"), [onChange]);
  return (
    <Row wrap gap={space.sm}>
      <Chip label="Aufgaben" count={activeCount} selected={tab === "tasks"} onPress={showTasks} />
      <Chip label="Postfach" selected={tab === "mailbox"} onPress={showMailbox} />
      <Chip label="Einstellungen" selected={tab === "settings"} onPress={showSettings} />
    </Row>
  );
}

function DemoBanner({ state, breeze }: { state: BreezeState; breeze: Breeze }) {
  if (!hasDemo(state)) return null;
  return (
    <Banner tone="warning" icon="FlaskConical" title="Demo-Daten aktiv">
      <Body muted>Einige Aufgaben sind Beispiele und keine echten Mails.</Body>
      <Actions>
        <Button
          label="Demo-Daten entfernen"
          icon="Trash2"
          variant="danger"
          busy={breeze.busy === "clear-demo"}
          onPress={breeze.clearDemo}
        />
      </Actions>
    </Banner>
  );
}

function TasksView({
  state,
  breeze,
  wide,
  filter,
  onFilter,
  selectedId,
  onSelect,
  onImport,
}: {
  state: BreezeState;
  breeze: Breeze;
  wide: boolean;
  filter: FilterKey;
  onFilter(next: FilterKey): void;
  selectedId: string | null;
  onSelect(id: string | null): void;
  onImport(): void;
}) {
  const tasks = useMemo(() => sortTasks(state.tasks), [state.tasks]);
  const visible = useMemo(() => visibleTasks(tasks, filter), [tasks, filter]);
  const selected = tasks.find((task) => task.id === selectedId) ?? null;
  const detail = wide ? (selected ?? visible[0] ?? null) : selected;
  const back = useCallback(() => onSelect(null), [onSelect]);

  const list =
    visible.length === 0 ? (
      <EmptyTasks state={state} filter={filter} breeze={breeze} onImport={onImport} />
    ) : (
      <TaskList tasks={visible} selectedId={detail?.id ?? null} onSelect={onSelect} />
    );

  if (!wide && selected) {
    return <TaskDetail key={selected.id} task={selected} breeze={breeze} onBack={back} />;
  }

  const header = (
    <>
      <DemoBanner state={state} breeze={breeze} />
      <FilterBar tasks={tasks} filter={filter} onChange={onFilter} />
    </>
  );

  if (!wide) {
    return (
      <Stack>
        {header}
        {list}
      </Stack>
    );
  }

  return (
    <Stack flex>
      {header}
      <View style={SPLIT}>
        <ScrollView style={LIST_PANE} contentContainerStyle={PANE_CONTENT}>
          {list}
        </ScrollView>
        <ScrollView style={DETAIL_PANE} contentContainerStyle={PANE_CONTENT}>
          {detail ? <TaskDetail key={detail.id} task={detail} breeze={breeze} /> : null}
        </ScrollView>
      </View>
    </Stack>
  );
}

function Loaded({
  state,
  breeze,
  tab,
  wide,
  filter,
  onFilter,
  selectedId,
  onSelect,
  onImport,
  onSetup,
}: {
  state: BreezeState;
  breeze: Breeze;
  tab: Tab;
  onSetup(): void;
  wide: boolean;
  filter: FilterKey;
  onFilter(next: FilterKey): void;
  selectedId: string | null;
  onSelect(id: string | null): void;
  onImport(): void;
}) {
  if (tab === "mailbox")
    return <ConnectionTab state={state} breeze={breeze} onImport={onImport} onSetup={onSetup} />;
  if (tab === "settings") return <PreferencesTab preferences={state.preferences} breeze={breeze} />;
  return (
    <TasksView
      state={state}
      breeze={breeze}
      wide={wide}
      filter={filter}
      onFilter={onFilter}
      selectedId={selectedId}
      onSelect={onSelect}
      onImport={onImport}
    />
  );
}

function Unavailable({ breeze }: { breeze: Breeze }) {
  return (
    <Banner tone="danger" icon="TriangleAlert" title="Mail Breeze antwortet nicht">
      <Body selectable>
        {breeze.error ?? "Der Dienst auf dem Host hat keinen Zustand geliefert."} Ist das Plugin auf
        diesem Host geladen?
      </Body>
      <Actions>
        <Button label="Erneut versuchen" icon="RefreshCw" onPress={breeze.retry} />
      </Actions>
    </Banner>
  );
}

function Spinner() {
  const { theme } = useKit();
  return (
    <View style={LOADING}>
      <ActivityIndicator color={theme.colors.accent} />
      <Body muted>Mail Breeze wird geladen</Body>
    </View>
  );
}

function Inner({ params, mode }: Pick<BreezeAppProps, "params" | "mode">) {
  const { theme, host, layout } = useKit();
  const { height } = useWindowDimensions();
  const breeze = useBreeze(host.id);
  const { state } = breeze;
  useBreezeNotices(host.id, state);

  const [tab, setTab] = useState<Tab>("tasks");
  const openSetup = useCallback(() => setTab("settings"), []);
  const [filter, setFilter] = useState<FilterKey>("active");
  const [selectedId, setSelectedId] = useState<string | null>(params?.taskId ?? null);
  const [importing, setImporting] = useState(false);
  const openImport = useCallback(() => setImporting(true), []);
  const closeImport = useCallback(() => setImporting(false), []);

  const wide = mode === "screen" && !layout.compact;
  const embedded = mode === "panel" || height < 760;
  const importAction = params?.action === "import";
  const importNonce = params?.nonce;
  const requestedTask = params?.taskId;

  useEffect(() => {
    if (importAction) {
      setTab("tasks");
      setImporting(true);
    }
  }, [importAction, importNonce]);

  useEffect(() => {
    if (requestedTask) {
      setTab("tasks");
      setSelectedId(requestedTask);
    }
  }, [requestedTask]);

  const activeCount = useMemo(() => (state?.tasks ?? []).filter(isActive).length, [state?.tasks]);

  const wideTasks = wide && tab === "tasks" && Boolean(state);
  const pad = layout.compact ? space.md : space.xl;
  const gap = layout.compact ? space.md : space.lg;
  const rootStyle = useMemo<ViewStyle>(
    () => ({ flex: 1, minHeight: 0, padding: pad, gap, backgroundColor: theme.colors.surface0 }),
    [pad, gap, theme],
  );
  const scrollStyle = useMemo<ViewStyle>(
    () => ({ flex: 1, backgroundColor: theme.colors.surface0 }),
    [theme],
  );
  const scrollContent = useMemo<ViewStyle>(
    () => ({
      padding: pad,
      gap,
      paddingBottom: space.xxl,
      maxWidth: wide ? 920 : undefined,
      width: "100%",
      alignSelf: "center",
    }),
    [pad, gap, wide],
  );

  let content = <Spinner />;
  if (!breeze.loading) {
    content = state ? (
      <Loaded
        state={state}
        breeze={breeze}
        tab={tab}
        wide={wide}
        filter={filter}
        onFilter={setFilter}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onImport={openImport}
        onSetup={openSetup}
      />
    ) : (
      <Unavailable breeze={breeze} />
    );
  }

  const modal = <ImportModal open={importing} onClose={closeImport} breeze={breeze} />;
  const top = (
    <>
      <Hero state={state} embedded={wideTasks ? embedded : mode === "panel"} />
      <Tabs tab={tab} activeCount={activeCount} onChange={setTab} />
      {breeze.actionError ? (
        <Banner title="Aktion fehlgeschlagen" tone="danger" icon="TriangleAlert">
          <Body>{breeze.actionError}</Body>
        </Banner>
      ) : null}
    </>
  );

  if (wideTasks) {
    return (
      <View style={rootStyle}>
        {top}
        {content}
        {modal}
      </View>
    );
  }

  return (
    <ScrollView
      style={scrollStyle}
      contentContainerStyle={scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {top}
      {content}
      {modal}
    </ScrollView>
  );
}

export function BreezeApp({ mode, params, theme, host, layout, navigation }: BreezeAppProps) {
  const value: KitValue = useMemo(
    () => ({
      theme,
      host,
      layout: mode === "panel" ? { ...layout, compact: true } : layout,
      navigation,
    }),
    [theme, host, layout, navigation, mode],
  );
  return (
    <KitProvider value={value}>
      <Inner params={params} mode={mode} />
    </KitProvider>
  );
}
