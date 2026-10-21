import { copyText, Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  type PressableStateCallbackType,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import type { BreezeState, Task } from "../shared/contracts";
import type { Breeze } from "./api";
import {
  clockTime,
  countByFilter,
  errorMessage,
  FILTERS,
  matchesFilter,
  relativeTime,
  snippet,
  sortTasks,
  type FilterKey,
} from "./format";
import {
  Actions,
  Banner,
  Body,
  Button,
  Chip,
  DemoPill,
  Heading,
  LinkOut,
  Pill,
  Row,
  Stack,
  Surface,
  useKit,
} from "./kit";
import { Panda } from "./panda";
import { alpha, BREEZE, radius, space, statusLook, type TaskStatus } from "./theme";

const FILTER_STRIP: ViewStyle = { gap: space.sm, paddingVertical: 2 };
const NO_GROW: ViewStyle = { flexGrow: 0 };
const EMPTY_SURFACE: ViewStyle = { alignItems: "center", paddingVertical: space.xxl };
const EMPTY_COPY: ViewStyle = { gap: space.sm, alignItems: "center", maxWidth: 420 };
const ROW_BODY: ViewStyle = { flex: 1, minWidth: 0, gap: 4 };
const ROW_TOP: ViewStyle = { flexDirection: "row", justifyContent: "space-between", gap: space.sm };
const MAIL_FACTS: ViewStyle = { gap: 3 };

interface FilterChipProps {
  item: { key: FilterKey; label: string };
  count: number;
  selected: boolean;
  onChange(next: FilterKey): void;
}

function FilterChip({ item, count, selected, onChange }: FilterChipProps) {
  const press = useCallback(() => onChange(item.key), [onChange, item.key]);
  return <Chip label={item.label} count={count} selected={selected} onPress={press} />;
}

export function FilterBar({
  tasks,
  filter,
  onChange,
}: {
  tasks: readonly Task[];
  filter: FilterKey;
  onChange(next: FilterKey): void;
}) {
  const counts = useMemo(() => countByFilter(tasks), [tasks]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={NO_GROW}
      contentContainerStyle={FILTER_STRIP}
    >
      {FILTERS.map((item) => (
        <FilterChip
          key={item.key}
          item={item}
          count={counts[item.key]}
          selected={filter === item.key}
          onChange={onChange}
        />
      ))}
    </ScrollView>
  );
}

interface RowStyles {
  circle: ViewStyle;
  title: TextStyle;
  time: TextStyle;
  sender: TextStyle;
  preview: TextStyle;
}

function rowStyles(
  tint: string,
  colors: { foreground: string; foregroundMuted: string },
): RowStyles {
  return {
    circle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tint,
    },
    title: {
      flex: 1,
      minWidth: 0,
      color: colors.foreground,
      fontSize: 15,
      fontWeight: "600",
      lineHeight: 21,
    },
    time: { color: colors.foregroundMuted, fontSize: 12, flexShrink: 0 },
    sender: { color: colors.foregroundMuted, fontSize: 13, minWidth: 0 },
    preview: { color: colors.foregroundMuted, fontSize: 13, lineHeight: 19, minWidth: 0 },
  };
}

const SOURCE_LABEL = {
  gmail: "Gmail",
  outlook: "Outlook",
  manual: "Manuell",
  unknown: "Importiert",
} as const;

function SourcePill({ task }: { task: Task }) {
  if (task.demo) return null;
  const source = task.mail.source ?? "unknown";
  const icon = source === "gmail" || source === "outlook" ? "Mail" : "ClipboardPaste";
  return <Pill label={SOURCE_LABEL[source]} icon={icon} />;
}

function TaskRow({
  task,
  selected,
  onSelect,
}: {
  task: Task;
  selected: boolean;
  onSelect(id: string): void;
}) {
  const { theme, layout } = useKit();
  const look = statusLook(theme, task.status);
  const styles = useMemo(() => rowStyles(look.tint, theme.colors), [look.tint, theme.colors]);
  const state = useMemo(() => ({ selected }), [selected]);
  const press = useCallback(() => onSelect(task.id), [onSelect, task.id]);
  const base = useMemo<ViewStyle>(
    () => ({
      flexDirection: "row",
      gap: space.md,
      padding: layout.compact ? space.md : space.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: selected ? BREEZE.sage : theme.colors.border,
      backgroundColor: selected ? alpha(BREEZE.sage, 0.16) : theme.colors.surface1,
    }),
    [theme, layout.compact, selected],
  );
  const resolve = useCallback(
    ({ pressed }: PressableStateCallbackType): ViewStyle => ({
      ...base,
      opacity: pressed ? 0.85 : 1,
    }),
    [base],
  );
  const label = `${task.title}, ${look.label}${task.demo ? ", Demo" : ""}, von ${task.mail.sender || task.mail.senderEmail}`;
  const working = task.status === "working";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={state}
      accessibilityLabel={label}
      onPress={press}
      style={resolve}
    >
      <View style={styles.circle}>
        {working ? <ActivityIndicator size="small" color={look.color} /> : null}
        {working ? null : <Icon name={look.icon} size={18} color={look.color} />}
      </View>
      <View style={ROW_BODY}>
        <View style={ROW_TOP}>
          <Text numberOfLines={2} style={styles.title}>
            {task.title}
          </Text>
          <Text style={styles.time}>{relativeTime(task.mail.receivedAt)}</Text>
        </View>
        <Text numberOfLines={1} style={styles.sender}>
          {task.mail.sender || task.mail.senderEmail}
        </Text>
        <Text numberOfLines={2} style={styles.preview}>
          {snippet(task.mail.body)}
        </Text>
        <Row wrap gap={space.sm}>
          <Pill look={look} label={look.label} />
          {task.demo ? <DemoPill /> : null}
          <SourcePill task={task} />
          {task.messageIds.length > 1 ? (
            <Pill label={`${task.messageIds.length} Mails`} icon="Layers" />
          ) : null}
          {task.todos.length > 0 ? (
            <Pill
              label={`${task.todos.length} To-do${task.todos.length === 1 ? "" : "s"}`}
              icon="ListTodo"
            />
          ) : null}
        </Row>
      </View>
    </Pressable>
  );
}

function emptyCopy(state: BreezeState, filter: FilterKey): string {
  if (state.tasks.length > 0) {
    return `Kein Eintrag im Filter ${FILTERS.find((f) => f.key === filter)?.label ?? ""}.`;
  }
  if (state.connection.status === "connected") {
    return "Sobald neue Mails eintreffen und gelesen sind, erscheinen sie hier.";
  }
  return "Kein Postfach verbunden. Verbinde Gmail oder Outlook im Tab Postfach, importiere eine Mail oder probiere die Demo-Daten aus.";
}

export function EmptyTasks({
  state,
  filter,
  breeze,
  onImport,
}: {
  state: BreezeState;
  filter: FilterKey;
  breeze: Breeze;
  onImport(): void;
}) {
  const { theme } = useKit();
  const none = state.tasks.length === 0;
  const title = useMemo<TextStyle>(
    () => ({
      color: theme.colors.foreground,
      fontSize: 17,
      fontWeight: "500",
      textAlign: "center",
    }),
    [theme],
  );
  const copy = useMemo<TextStyle>(
    () => ({
      color: theme.colors.foregroundMuted,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
    }),
    [theme],
  );
  return (
    <Surface extra={EMPTY_SURFACE}>
      <Panda size={112} label="Panda wartet auf Post" />
      <View style={EMPTY_COPY}>
        <Text style={title}>{none ? "Noch keine Aufgaben" : "Hier ist nichts"}</Text>
        <Text style={copy}>{emptyCopy(state, filter)}</Text>
      </View>
      {none ? (
        <Row wrap gap={space.md}>
          <Button
            label="Mail einfügen"
            icon="ClipboardPaste"
            variant="primary"
            onPress={onImport}
          />
          <Button
            label="Demo-Daten laden"
            icon="Sparkles"
            busy={breeze.busy === "demo"}
            onPress={breeze.loadDemo}
          />
        </Row>
      ) : null}
    </Surface>
  );
}

export function TaskList({
  tasks,
  selectedId,
  onSelect,
}: {
  tasks: readonly Task[];
  selectedId: string | null;
  onSelect(id: string): void;
}) {
  return (
    <Stack gap={space.sm}>
      {sortTasks(tasks).map((task) => (
        <TaskRow key={task.id} task={task} selected={task.id === selectedId} onSelect={onSelect} />
      ))}
    </Stack>
  );
}

export function visibleTasks(tasks: readonly Task[], filter: FilterKey): Task[] {
  return tasks.filter((task) => matchesFilter(task, filter));
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: ReactNode;
}) {
  const { theme } = useKit();
  return (
    <Surface>
      <Row gap={space.sm}>
        <Icon name={icon} size={16} color={theme.colors.foregroundMuted} />
        <Heading>{title}</Heading>
      </Row>
      {children}
    </Surface>
  );
}

function MailCard({ task }: { task: Task }) {
  const { theme } = useKit();
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((value) => !value), []);
  const long = task.mail.body.length > 600;
  const { mail } = task;
  const subject = useMemo<TextStyle>(
    () => ({ color: theme.colors.foreground, fontSize: 14, fontWeight: "600" }),
    [theme],
  );
  const box = useMemo<ViewStyle>(
    () => ({
      padding: space.md,
      borderRadius: radius.sm,
      backgroundColor: theme.colors.surface0,
      borderWidth: 1,
      borderColor: theme.colors.border,
    }),
    [theme],
  );
  return (
    <SectionCard title="Ursprungsmail" icon="Mail">
      <View style={MAIL_FACTS}>
        <Text style={subject} selectable>
          {mail.subject}
        </Text>
        <Body muted size={13}>
          Von {mail.sender ? `${mail.sender} <${mail.senderEmail}>` : mail.senderEmail}
        </Body>
        <Body muted size={13}>
          Empfangen {clockTime(mail.receivedAt)}
        </Body>
        {task.messageIds.length > 1 ? (
          <Body muted size={13}>
            Diese Aufgabe fasst {task.messageIds.length} Mails derselben Unterhaltung zusammen.
          </Body>
        ) : null}
      </View>
      <View style={box}>
        <Body selectable lines={expanded || !long ? undefined : 12}>
          {mail.body}
        </Body>
      </View>
      <Row wrap gap={space.md}>
        {long ? (
          <Button
            label={expanded ? "Weniger anzeigen" : "Ganze Mail zeigen"}
            icon={expanded ? "ChevronUp" : "ChevronDown"}
            variant="ghost"
            onPress={toggle}
          />
        ) : null}
        {mail.webLink ? <LinkOut href={mail.webLink}>Mail im Browser öffnen</LinkOut> : null}
      </Row>
    </SectionCard>
  );
}

function TodoCard({ todos }: { todos: readonly string[] }) {
  return (
    <SectionCard title="To-dos" icon="ListTodo">
      <Stack gap={space.sm}>
        {todos.map((todo, index) => (
          <Row key={todo} gap={space.sm}>
            <Body muted>{`${index + 1}.`}</Body>
            <Body selectable>{todo}</Body>
          </Row>
        ))}
      </Stack>
    </SectionCard>
  );
}

function resultTitle(task: Task): string {
  if (task.todos.length > 0 || (task.status === "dismissed" && !task.agentId)) return "Einordnung";
  return task.status === "needs_input" ? "Rückfrage des Agenten" : "Ergebnis";
}

function ResultCard({ task }: { task: Task }) {
  const toast = useToast();
  const copy = useCallback(async () => {
    try {
      await copyText(task.result);
      toast.show("Ergebnis kopiert", { variant: "success" });
    } catch (error) {
      toast.error(`Kopieren fehlgeschlagen: ${errorMessage(error)}`);
    }
  }, [task.result, toast]);
  return (
    <SectionCard title={resultTitle(task)} icon="Sparkles">
      <Body selectable>{task.result}</Body>
      <Row wrap>
        <Button label="Ergebnis kopieren" icon="Copy" variant="ghost" onPress={copy} />
      </Row>
    </SectionCard>
  );
}

function DismissConfirm({
  busy,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  onConfirm(): void;
  onCancel(): void;
}) {
  return (
    <Banner tone="warning" icon="EyeOff" title="Aufgabe verwerfen?">
      <Body muted>
        Die Mail im Postfach bleibt unberührt. Mail Breeze legt die Aufgabe nur ab und zeigt sie
        unter Verworfen.
      </Body>
      <Actions>
        <Button label="Ja, verwerfen" variant="danger" busy={busy} onPress={onConfirm} />
        <Button label="Behalten" variant="ghost" onPress={onCancel} />
      </Actions>
    </Banner>
  );
}

function WorkingNote({ hasAgent }: { hasAgent: boolean }) {
  return (
    <Banner tone="info" icon="Wind" title="Ein Agent arbeitet daran">
      <Row gap={space.sm}>
        <ActivityIndicator size="small" color={BREEZE.mint} />
        <Body muted>
          {hasAgent
            ? "Das Ergebnis erscheint hier, sobald der Agentenlauf endet."
            : "Die Aufgabe ist als in Arbeit markiert. Ein Agent ist noch nicht zugeordnet."}
        </Body>
      </Row>
    </Banner>
  );
}

const TONE_BY_STATUS: Record<TaskStatus, "plain" | "sage" | "sun"> = {
  ready: "plain",
  working: "plain",
  failed: "plain",
  dismissed: "plain",
  done: "sage",
  needs_input: "sun",
};

function startLabel(status: TaskStatus): string {
  if (status === "failed") return "Erneut versuchen";
  return status === "needs_input" ? "Claude bearbeiten lassen" : "Aufgabe starten";
}

function DetailActions({
  task,
  breeze,
  onAskDismiss,
}: {
  task: Task;
  breeze: Breeze;
  onAskDismiss(): void;
}) {
  const { navigation } = useKit();
  const { id, agentId } = task;
  const canStart =
    task.status === "ready" ||
    task.status === "failed" ||
    (task.status === "needs_input" && task.todos.length > 0);
  const canDismiss = task.status !== "working" && task.status !== "dismissed";
  const start = useCallback(() => breeze.start(id), [breeze, id]);
  const openAgent = useCallback(() => {
    if (agentId) navigation?.openAgent({ agentId });
  }, [navigation, agentId]);
  const showAgent = Boolean(agentId && navigation);
  return (
    <Row wrap gap={space.md}>
      {canStart ? (
        <Button
          label={startLabel(task.status)}
          icon={task.status === "failed" ? "RotateCcw" : "Play"}
          variant="primary"
          busy={breeze.busy === `start:${id}`}
          onPress={start}
        />
      ) : null}
      {showAgent ? (
        <Button
          label={task.status === "working" ? "Agenten ansehen" : "Agenten öffnen"}
          icon="Bot"
          variant={canStart ? "soft" : "primary"}
          onPress={openAgent}
        />
      ) : null}
      {canDismiss ? (
        <Button label="Verwerfen" icon="EyeOff" variant="ghost" onPress={onAskDismiss} />
      ) : null}
    </Row>
  );
}

export function TaskDetail({
  task,
  breeze,
  onBack,
}: {
  task: Task;
  breeze: Breeze;
  onBack?: () => void;
}) {
  const { theme, layout } = useKit();
  const [confirming, setConfirming] = useState(false);
  const look = statusLook(theme, task.status);
  const askDismiss = useCallback(() => setConfirming(true), []);
  const cancelDismiss = useCallback(() => setConfirming(false), []);
  const { dismiss } = breeze;
  const taskId = task.id;
  const confirmDismiss = useCallback(() => {
    dismiss(taskId);
    setConfirming(false);
  }, [dismiss, taskId]);
  const title = useMemo<TextStyle>(
    () => ({
      color: theme.colors.foreground,
      fontSize: layout.compact ? 20 : 24,
      fontWeight: "400",
      lineHeight: layout.compact ? 27 : 32,
    }),
    [theme, layout.compact],
  );

  return (
    <Stack gap={layout.compact ? space.md : space.lg}>
      {onBack ? (
        <Row>
          <Button label="Zur Liste" icon="ChevronLeft" variant="ghost" onPress={onBack} />
        </Row>
      ) : null}

      <Surface tone={TONE_BY_STATUS[task.status]}>
        <Row wrap gap={space.sm}>
          <Pill look={look} label={look.label} />
          {task.demo ? <DemoPill /> : null}
          <SourcePill task={task} />
          <Body muted size={12}>
            Aktualisiert {relativeTime(task.updatedAt)}
          </Body>
        </Row>
        <Text accessibilityRole="header" selectable style={title}>
          {task.title}
        </Text>
        {task.demo ? (
          <Body muted size={13}>
            Beispielaufgabe aus den Demo-Daten, keine echte Mail.
          </Body>
        ) : null}
        {confirming ? (
          <DismissConfirm
            busy={breeze.busy === `dismiss:${task.id}`}
            onConfirm={confirmDismiss}
            onCancel={cancelDismiss}
          />
        ) : (
          <DetailActions task={task} breeze={breeze} onAskDismiss={askDismiss} />
        )}
      </Surface>

      {task.status === "working" ? <WorkingNote hasAgent={Boolean(task.agentId)} /> : null}

      {task.error ? (
        <Banner
          tone={task.status === "working" ? "warning" : "danger"}
          icon={task.status === "working" ? "Hand" : "TriangleAlert"}
          title={task.status === "working" ? "Hinweis" : "Fehler bei der Ausführung"}
        >
          <Body selectable>{task.error}</Body>
        </Banner>
      ) : null}

      {task.todos.length > 0 ? <TodoCard todos={task.todos} /> : null}

      {task.result ? <ResultCard task={task} /> : null}

      <MailCard task={task} />
    </Stack>
  );
}
