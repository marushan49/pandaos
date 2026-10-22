import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Text,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type ViewStyle,
} from "react-native";
import { JSONUIProvider, Renderer, type ComponentRenderProps } from "@json-render/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginTimelineItemProps, PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { TextInput, ScrollView } from "@getpaseo/plugin/client/react-native";
import { SettingsAction } from "@getpaseo/plugin/client/ui";
import type { z } from "zod";
import { costSimulator } from "../shared/demo";
import { readState, saveState, stateKeySchema, type savedStateSchema } from "../shared/state";
import {
  calculate,
  initialValues,
  parseNumericInput,
  type Surface,
  type Values,
} from "../shared/surface";
import { createSpec } from "./spec";
import { useSurfaceStyles } from "./styles";
import type { timelineDataSchema } from "./transform";

type Saved = z.output<typeof savedStateSchema>;
export interface Persistence {
  read(): Promise<Saved>;
  save(values: Values, expectedRevision: number): Promise<Saved>;
}
interface SurfaceContextValue {
  theme: PluginTheme;
  styles: ReturnType<typeof useSurfaceStyles>;
  surface: Surface;
  drafts: Record<string, string>;
  disabled: boolean;
  update(id: string, text: string): void;
}
const SurfaceContext = createContext<SurfaceContextValue | null>(null);
const emptyHandlers = {};
const sliderActions = [{ name: "increment" }, { name: "decrement" }];
function useSurface() {
  const context = useContext(SurfaceContext);
  if (!context) throw new Error("Missing surface context");
  return context;
}
function Stack({ children }: ComponentRenderProps) {
  const { styles } = useSurface();
  return <View style={styles.stack}>{children}</View>;
}
function Input({ element }: ComponentRenderProps<{ index: number }>) {
  const { styles, surface, drafts, disabled, update } = useSurface();
  const field = surface.inputs[element.props.index];
  const change = useCallback((text: string) => update(field.id, text), [field.id, update]);
  return (
    <View style={styles.group}>
      <Text style={styles.text}>{field.label}</Text>
      <TextInput
        accessibilityLabel={field.label}
        value={drafts[field.id]}
        editable={!disabled}
        onChangeText={change}
        style={styles.input}
      />
      {field.kind === "slider" && <Slider index={element.props.index} />}
    </View>
  );
}
function Slider({ index }: { index: number }) {
  const { theme, styles, surface, drafts, disabled, update } = useSurface();
  const field = surface.inputs[index];
  const [width, setWidth] = useState(1);
  const value = parseNumericInput(drafts[field.id]);
  const current = Number.isFinite(value) ? value : field.value;
  const change = useCallback(
    (nextValue: number) =>
      update(field.id, String(Math.min(field.max, Math.max(field.min, nextValue)))),
    [field, update],
  );
  const decrease = useCallback(() => change(current - field.step), [change, current, field.step]);
  const increase = useCallback(() => change(current + field.step), [change, current, field.step]);
  const slide = useCallback(
    (event: GestureResponderEvent) =>
      change(
        field.min +
          Math.round(
            ((event.nativeEvent.locationX / width) * (field.max - field.min)) / field.step,
          ) *
            field.step,
      ),
    [change, field, width],
  );
  const measure = useCallback(
    (event: LayoutChangeEvent) => setWidth(Math.max(1, event.nativeEvent.layout.width)),
    [],
  );
  const start = useCallback(() => !disabled, [disabled]);
  const accessible = useCallback(
    (event: AccessibilityActionEvent) => {
      if (disabled) return;
      if (event.nativeEvent.actionName === "increment") increase();
      if (event.nativeEvent.actionName === "decrement") decrease();
    },
    [disabled, increase, decrease],
  );
  const accessibilityValue = useMemo(
    () => ({ min: field.min, max: field.max, now: current }),
    [field.min, field.max, current],
  );
  const fill = useMemo<ViewStyle>(
    () => ({
      height: 6,
      backgroundColor: theme.colors.accent,
      borderRadius: 3,
      width: `${Math.min(100, Math.max(0, ((current - field.min) / (field.max - field.min)) * 100))}%`,
    }),
    [theme, current, field],
  );
  return (
    <View style={styles.group}>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={`${field.label} slider`}
        accessibilityValue={accessibilityValue}
        accessibilityActions={sliderActions}
        onAccessibilityAction={accessible}
        onLayout={measure}
        onStartShouldSetResponder={start}
        onResponderGrant={slide}
        onResponderMove={slide}
        style={styles.slider}
      >
        <View style={styles.track}>
          <View style={fill} />
        </View>
      </View>
      <SettingsAction
        label={field.label}
        actionLabel={`Decrease ${field.label}`}
        onPress={decrease}
        disabled={disabled || current <= field.min}
      />
      <SettingsAction
        label={field.label}
        actionLabel={`Increase ${field.label}`}
        onPress={increase}
        disabled={disabled || current >= field.max}
      />
    </View>
  );
}
function Note({ element }: ComponentRenderProps<{ text: string }>) {
  const { styles } = useSurface();
  return <Text style={styles.muted}>{element.props.text}</Text>;
}
function Metric({ element }: ComponentRenderProps<{ label: string; text: string }>) {
  const { styles } = useSurface();
  return (
    <View style={styles.tight}>
      <Text style={styles.muted}>{element.props.label}</Text>
      <Text accessibilityLiveRegion="polite" style={styles.metric}>
        {element.props.text}
      </Text>
    </View>
  );
}
interface Cell {
  id: string;
  text: string;
}
interface TableRow {
  id: string;
  cells: Cell[];
}
interface TableProps {
  label: string;
  columns: Cell[];
  rows: TableRow[];
}
function TableBody({ columns, rows }: TableProps) {
  const { styles } = useSurface();
  return (
    <View style={styles.table}>
      <View style={styles.tableHeader}>
        {columns.map((column) => (
          <Text key={column.id} style={styles.headerCell}>
            {column.text}
          </Text>
        ))}
      </View>
      {rows.map((row) => (
        <DataRow key={row.id} row={row} />
      ))}
    </View>
  );
}
function DataRow({ row }: { row: TableRow }) {
  const { styles } = useSurface();
  return (
    <View style={styles.tableRow}>
      {row.cells.map((cell) => (
        <Text key={cell.id} style={styles.cell}>
          {cell.text}
        </Text>
      ))}
    </View>
  );
}
function Table({ element }: ComponentRenderProps<TableProps>) {
  const { styles } = useSurface();
  return (
    <View style={styles.tight}>
      <Text style={styles.title}>{element.props.label}</Text>
      <ScrollView horizontal>
        <TableBody {...element.props} />
      </ScrollView>
      {element.props.rows.length === 0 && <Text style={styles.muted}>No rows.</Text>}
    </View>
  );
}
interface ChartPoint {
  id: string;
  label: string;
  text: string;
  width: number;
}
function Bar({ point }: { point: ChartPoint }) {
  const { theme, styles } = useSurface();
  const fill = useMemo<ViewStyle>(
    () => ({ height: 8, width: `${point.width}%`, backgroundColor: theme.colors.accent }),
    [point.width, theme],
  );
  return (
    <View accessibilityLabel={`${point.label}: ${point.text}`} style={styles.tight}>
      <Text style={styles.text}>
        {point.label}: {point.text}
      </Text>
      <View style={styles.chartTrack}>
        <View style={fill} />
      </View>
    </View>
  );
}
function BarChart({ element }: ComponentRenderProps<{ label: string; points: ChartPoint[] }>) {
  const { styles } = useSurface();
  return (
    <View style={styles.group}>
      <Text style={styles.title}>{element.props.label}</Text>
      {element.props.points.map((point) => (
        <Bar key={point.id} point={point} />
      ))}
    </View>
  );
}
const registry = { Stack, Input, Note, Metric, Table, BarChart };

function toDrafts(values: Values) {
  return Object.fromEntries(Object.entries(values).map(([id, value]) => [id, String(value)]));
}
function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function InteractiveSurface({
  surface: snapshot,
  theme,
  persistence,
  compact = false,
}: {
  surface: Surface;
  theme: PluginTheme;
  persistence: Persistence;
  compact?: boolean;
}) {
  const [surface] = useState(snapshot);
  const styles = useSurfaceStyles(theme, compact);
  const [drafts, setDrafts] = useState(() => toDrafts(initialValues(surface)));
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState("");
  const revision = useRef(0);
  const mounted = useRef(true);
  const generation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const restore = useCallback(async () => {
    const current = ++generation.current;
    setStatus("loading");
    setMessage("");
    try {
      const saved = await persistence.read();
      if (!mounted.current || current !== generation.current) return;
      revision.current = saved.revision;
      setDrafts(toDrafts(saved.values ?? initialValues(surface)));
      setMessage(saved.values ? "Saved inputs loaded." : "Using initial inputs.");
      setStatus("ready");
    } catch (error) {
      if (!mounted.current || current !== generation.current) return;
      setStatus("error");
      setMessage(errorMessage(error, "Could not restore inputs."));
    }
  }, [persistence, surface]);
  useEffect(() => {
    void restore();
    return () => {
      generation.current += 1;
    };
  }, [restore]);
  const values = Object.fromEntries(
    Object.entries(drafts).map(([id, text]) => [id, parseNumericInput(text)]),
  );
  let validation = "";
  let result: Values | null;
  try {
    result = calculate(surface, values);
  } catch (error) {
    validation = errorMessage(error, "Invalid inputs.");
    result = null;
  }
  const spec = createSpec(surface, result);
  const disabled = status === "loading" || status === "saving";
  const update = useCallback((id: string, text: string) => {
    setDrafts((current) => ({ ...current, [id]: text }));
    setMessage("");
  }, []);
  const context = useMemo(
    () => ({ surface, theme, styles, drafts, disabled, update }),
    [surface, theme, styles, drafts, disabled, update],
  );
  const save = useCallback(async () => {
    if (disabled || validation) return;
    setStatus("saving");
    setMessage("");
    try {
      const saved = await persistence.save(values, revision.current);
      if (!mounted.current) return;
      revision.current = saved.revision;
      setStatus("ready");
      setMessage("Inputs saved on this host.");
    } catch (error) {
      if (!mounted.current) return;
      setStatus("error");
      setMessage(errorMessage(error, "Could not save inputs."));
    }
  }, [disabled, validation, persistence, values]);
  const onSave = useCallback(() => {
    void save();
  }, [save]);
  const onReload = useCallback(() => {
    void restore();
  }, [restore]);
  const reset = useCallback(() => {
    setDrafts(toDrafts(initialValues(surface)));
    setMessage("Inputs reset locally. Save to keep them.");
  }, [surface]);
  return (
    <View style={styles.box}>
      <Text style={styles.title}>{surface.title}</Text>
      {status === "loading" && (
        <Text accessibilityLiveRegion="polite" style={styles.muted}>
          Restoring saved inputs…
        </Text>
      )}
      <SurfaceContext.Provider value={context}>
        <JSONUIProvider handlers={emptyHandlers}>
          <Renderer spec={spec} registry={registry} includeStandard={false} />
        </JSONUIProvider>
      </SurfaceContext.Provider>
      {validation !== "" && (
        <Text accessibilityRole="alert" style={styles.error}>
          {validation}
        </Text>
      )}
      {message !== "" && (
        <Text
          accessibilityRole={status === "error" ? "alert" : undefined}
          accessibilityLiveRegion="polite"
          style={status === "error" ? styles.error : styles.muted}
        >
          {message}
        </Text>
      )}
      {surface.actions.includes("reset") && (
        <SettingsAction
          label="Local assumptions"
          actionLabel="Reset inputs"
          disabled={disabled}
          onPress={reset}
        />
      )}
      {surface.actions.includes("save") && (
        <SettingsAction
          label="Keep these assumptions on this host"
          actionLabel={status === "saving" ? "Saving inputs…" : "Save inputs"}
          disabled={disabled || validation !== ""}
          onPress={onSave}
        />
      )}
      <SettingsAction
        label="Replace local edits with the saved values"
        actionLabel="Reload saved inputs"
        disabled={disabled}
        onPress={onReload}
      />
      <Text style={styles.muted}>{surface.fallback}</Text>
    </View>
  );
}

function StoredSurface({
  surface,
  sourceKey,
  agentId,
  theme,
  compact,
}: {
  surface: Surface;
  sourceKey: string;
  agentId: string;
  theme: PluginTheme;
  compact: boolean;
}) {
  const read = useRpc(readState);
  const save = useRpc(saveState);
  const identity = JSON.stringify({ surface, sourceKey, agentId });
  const key = useMemo(() => stateKeySchema.parse(JSON.parse(identity)), [identity]);
  const persistence = useMemo<Persistence>(
    () => ({
      read: () => read(key),
      save: (values, expectedRevision) => save({ ...key, values, expectedRevision }),
    }),
    [read, save, key],
  );
  return (
    <InteractiveSurface
      key={identity}
      surface={surface}
      theme={theme}
      compact={compact}
      persistence={persistence}
    />
  );
}
export function SurfaceTimeline({
  item,
  theme,
  layout,
  agentId,
}: PluginTimelineItemProps<z.output<typeof timelineDataSchema>>) {
  const styles = useSurfaceStyles(theme, layout.compact);
  return (
    <View style={styles.stack}>
      {item.data.before !== "" && <Text style={styles.text}>{item.data.before}</Text>}
      <StoredSurface
        surface={item.data.surface}
        sourceKey={item.data.sourceKey}
        agentId={agentId}
        theme={theme}
        compact={layout.compact}
      />
      {item.data.phase === "streaming" && (
        <Text style={styles.muted}>Response still streaming…</Text>
      )}
      {item.data.after !== "" && <Text style={styles.text}>{item.data.after}</Text>}
    </View>
  );
}
export function DemoScreen({ theme, layout }: PluginSurfaceProps) {
  const styles = useSurfaceStyles(theme, layout.compact);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <StoredSurface
        surface={costSimulator}
        sourceKey="cost-simulator-demo"
        agentId="demo"
        theme={theme}
        compact={layout.compact}
      />
    </ScrollView>
  );
}
