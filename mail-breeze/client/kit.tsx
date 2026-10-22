import type { PluginHostProps } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, TextInput } from "@getpaseo/plugin/client/react-native";
import { ExternalLink } from "@getpaseo/plugin/client/ui";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type FlexAlignType,
  type PressableStateCallbackType,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { alpha, BREEZE, radius, space, type StatusLook } from "./theme";

interface Navigation {
  openAgent(input: { agentId: string }): void;
}

export interface KitValue extends PluginHostProps {
  navigation?: Navigation;
}

const KitContext = createContext<KitValue | null>(null);

export function KitProvider({ value, children }: { value: KitValue; children: ReactNode }) {
  return <KitContext.Provider value={value}>{children}</KitContext.Provider>;
}

export function useKit(): KitValue {
  const value = useContext(KitContext);
  if (!value) throw new Error("Mail Breeze UI must render inside KitProvider");
  return value;
}

export type Tone = "plain" | "sage" | "sky" | "sun";

const TONE_ALPHA: Record<Exclude<Tone, "plain">, string> = {
  sage: alpha(BREEZE.sage, 0.14),
  sky: alpha(BREEZE.sky, 0.14),
  sun: alpha(BREEZE.sun, 0.18),
};

function toneBackground(theme: PluginTheme, tone: Tone): string {
  return tone === "plain" ? theme.colors.surface1 : TONE_ALPHA[tone];
}

export function Surface({
  children,
  extra,
  tone = "plain",
}: {
  children: ReactNode;
  extra?: ViewStyle;
  tone?: Tone;
}) {
  const { theme, layout } = useKit();
  const style = useMemo<ViewStyle>(
    () => ({
      backgroundColor: toneBackground(theme, tone),
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: layout.compact ? space.md : space.lg,
      gap: space.md,
      ...extra,
    }),
    [theme, tone, layout.compact, extra],
  );
  return <View style={style}>{children}</View>;
}

const HEADING_WRAP: ViewStyle = { gap: 2, flexShrink: 1, minWidth: 0 };

export function Heading({ children, hint }: { children: ReactNode; hint?: string }) {
  const { theme } = useKit();
  const title = useMemo<TextStyle>(
    () => ({ color: theme.colors.foreground, fontSize: 15, fontWeight: "600" }),
    [theme],
  );
  const note = useMemo<TextStyle>(
    () => ({ color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 19 }),
    [theme],
  );
  return (
    <View style={HEADING_WRAP}>
      <Text accessibilityRole="header" style={title}>
        {children}
      </Text>
      {hint ? <Text style={note}>{hint}</Text> : null}
    </View>
  );
}

export function Body({
  children,
  muted,
  selectable,
  lines,
  size = 14,
  strong,
}: {
  children: ReactNode;
  muted?: boolean;
  selectable?: boolean;
  lines?: number;
  size?: number;
  strong?: boolean;
}) {
  const { theme } = useKit();
  const style = useMemo<TextStyle>(
    () => ({
      color: muted ? theme.colors.foregroundMuted : theme.colors.foreground,
      fontSize: size,
      lineHeight: Math.round(size * 1.5),
      fontWeight: strong ? "600" : "400",
      flexShrink: 1,
      minWidth: 0,
    }),
    [theme, muted, size, strong],
  );
  return (
    <Text selectable={selectable} numberOfLines={lines} style={style}>
      {children}
    </Text>
  );
}

export function Pill({
  label,
  icon,
  look,
  color,
  tint,
}: {
  label: string;
  icon?: string;
  look?: StatusLook;
  color?: string;
  tint?: string;
}) {
  const { theme } = useKit();
  const fg = look?.color ?? color ?? theme.colors.foregroundMuted;
  const bg = look?.tint ?? tint ?? alpha(theme.colors.foregroundMuted, 0.12);
  const glyph = icon ?? look?.icon;
  const wrap = useMemo<ViewStyle>(
    () => ({
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: radius.pill,
      backgroundColor: bg,
      flexShrink: 0,
    }),
    [bg],
  );
  const text = useMemo<TextStyle>(() => ({ color: fg, fontSize: 12, fontWeight: "600" }), [fg]);
  return (
    <View style={wrap}>
      {glyph ? <Icon name={glyph} size={12} color={fg} /> : null}
      <Text style={text}>{label}</Text>
    </View>
  );
}

export type ButtonVariant = "primary" | "soft" | "ghost" | "danger";

interface ButtonPalette {
  bg: string;
  fg: string;
  border: string;
}

function buttonPalette(theme: PluginTheme, variant: ButtonVariant): ButtonPalette {
  const c = theme.colors;
  const table: Record<ButtonVariant, ButtonPalette> = {
    primary: { bg: c.accent, fg: c.accentForeground, border: c.accent },
    danger: {
      bg: alpha(c.statusDanger, 0.1),
      fg: c.statusDanger,
      border: alpha(c.statusDanger, 0.4),
    },
    ghost: { bg: "transparent", fg: c.foregroundMuted, border: "transparent" },
    soft: { bg: alpha(BREEZE.sage, 0.16), fg: c.foreground, border: alpha(BREEZE.sage, 0.5) },
  };
  return table[variant];
}

export function Button({
  label,
  onPress,
  icon,
  variant = "soft",
  busy,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress(): void;
  icon?: string;
  variant?: ButtonVariant;
  busy?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { theme, layout } = useKit();
  const palette = useMemo(() => buttonPalette(theme, variant), [theme, variant]);
  const inactive = Boolean(disabled || busy);
  const state = useMemo(() => ({ disabled: inactive, busy: Boolean(busy) }), [inactive, busy]);
  const base = useMemo<ViewStyle>(
    () => ({
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      minHeight: layout.compact ? 44 : 38,
      paddingHorizontal: space.lg,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.bg,
      flexShrink: 0,
    }),
    [layout.compact, palette],
  );
  const resolve = useCallback(
    ({ pressed }: PressableStateCallbackType): ViewStyle => {
      const live = pressed ? 0.8 : 1;
      return { ...base, opacity: inactive ? 0.5 : live };
    },
    [base, inactive],
  );
  const text = useMemo<TextStyle>(
    () => ({ color: palette.fg, fontSize: 14, fontWeight: "600" }),
    [palette],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={state}
      disabled={inactive}
      onPress={onPress}
      style={resolve}
    >
      {busy ? <ActivityIndicator size="small" color={palette.fg} /> : null}
      {!busy && icon ? <Icon name={icon} size={16} color={palette.fg} /> : null}
      <Text style={text}>{label}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onPress(): void;
}) {
  const { theme, layout } = useKit();
  const state = useMemo(() => ({ selected }), [selected]);
  const base = useMemo<ViewStyle>(
    () => ({
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: layout.compact ? 40 : 34,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: selected ? BREEZE.sage : theme.colors.border,
      backgroundColor: selected ? alpha(BREEZE.sage, 0.24) : "transparent",
    }),
    [theme, layout.compact, selected],
  );
  const resolve = useCallback(
    ({ pressed }: PressableStateCallbackType): ViewStyle => ({
      ...base,
      opacity: pressed ? 0.8 : 1,
    }),
    [base],
  );
  const labelStyle = useMemo<TextStyle>(
    () => ({
      color: selected ? theme.colors.foreground : theme.colors.foregroundMuted,
      fontSize: 13,
      fontWeight: selected ? "600" : "500",
    }),
    [theme, selected],
  );
  const countStyle = useMemo<TextStyle>(
    () => ({
      color: selected ? theme.colors.foreground : theme.colors.foregroundMuted,
      fontSize: 12,
      fontWeight: "600",
      opacity: count === 0 ? 0.5 : 1,
    }),
    [theme, selected, count],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={state}
      accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
      onPress={onPress}
      style={resolve}
    >
      <Text style={labelStyle}>{label}</Text>
      {count === undefined ? null : <Text style={countStyle}>{count}</Text>}
    </Pressable>
  );
}

const FIELD_WRAP: ViewStyle = { gap: 5 };

export function Field({
  label,
  hint,
  error,
  minHeight,
  ...input
}: TextInputProps & { label: string; hint?: string; error?: string; minHeight?: number }) {
  const { theme, layout } = useKit();
  const multiline = Boolean(input.multiline);
  const labelStyle = useMemo<TextStyle>(
    () => ({ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }),
    [theme],
  );
  const inputStyle = useMemo<TextStyle>(
    () => ({
      color: theme.colors.foreground,
      backgroundColor: theme.colors.surface0,
      borderWidth: 1,
      borderColor: error ? theme.colors.statusDanger : theme.colors.border,
      borderRadius: radius.sm,
      paddingHorizontal: space.md,
      paddingVertical: multiline ? space.md : space.sm,
      minHeight: minHeight ?? (layout.compact ? 46 : 40),
      fontSize: 14,
      textAlignVertical: multiline ? "top" : "center",
    }),
    [theme, layout.compact, error, multiline, minHeight],
  );
  const errorStyle = useMemo<TextStyle>(
    () => ({ color: theme.colors.statusDanger, fontSize: 12 }),
    [theme],
  );
  const hintStyle = useMemo<TextStyle>(
    () => ({ color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 17 }),
    [theme],
  );
  const message = error ?? hint;
  const note = message ? <Text style={error ? errorStyle : hintStyle}>{message}</Text> : null;
  return (
    <View style={FIELD_WRAP}>
      <Text style={labelStyle}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.colors.foregroundMuted}
        {...input}
        style={inputStyle}
      />
      {note}
    </View>
  );
}

export type BannerTone = "info" | "warning" | "danger" | "success";

function bannerColor(theme: PluginTheme, tone: BannerTone): string {
  const table: Record<BannerTone, string> = {
    danger: theme.colors.statusDanger,
    warning: theme.colors.statusWarning,
    success: theme.colors.statusSuccess,
    info: BREEZE.sky,
  };
  return table[tone];
}

const BANNER_ICON: ViewStyle = { paddingTop: 2 };
const BANNER_BODY: ViewStyle = { flex: 1, minWidth: 0, gap: space.sm };
const ACTIONS: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: space.sm };

export function Banner({
  tone,
  icon,
  title,
  children,
}: {
  tone: BannerTone;
  icon: string;
  title: string;
  children?: ReactNode;
}) {
  const { theme } = useKit();
  const color = bannerColor(theme, tone);
  const wrap = useMemo<ViewStyle>(
    () => ({
      flexDirection: "row",
      gap: space.md,
      padding: space.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: alpha(color, 0.45),
      backgroundColor: alpha(color, 0.12),
    }),
    [color],
  );
  const titleStyle = useMemo<TextStyle>(
    () => ({ color: theme.colors.foreground, fontSize: 14, fontWeight: "600" }),
    [theme],
  );
  return (
    <View accessibilityRole={tone === "danger" ? "alert" : undefined} style={wrap}>
      <View style={BANNER_ICON}>
        <Icon name={icon} size={18} color={color} />
      </View>
      <View style={BANNER_BODY}>
        <Text style={titleStyle}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

export function Actions({ children }: { children: ReactNode }) {
  return <View style={ACTIONS}>{children}</View>;
}

export function LinkOut({ href, children }: { href: string; children: string }) {
  const { theme } = useKit();
  const style = useMemo<TextStyle>(
    () => ({ color: theme.colors.accent, fontSize: 14, fontWeight: "600" }),
    [theme],
  );
  return (
    <ExternalLink href={href} accessibilityLabel={children}>
      <Text style={style}>{children}</Text>
    </ExternalLink>
  );
}

export function Row({
  children,
  gap = space.sm,
  wrap,
  align = "center",
  justify,
  grow,
}: {
  children: ReactNode;
  gap?: number;
  wrap?: boolean;
  align?: FlexAlignType;
  justify?: ViewStyle["justifyContent"];
  grow?: boolean;
}) {
  const style = useMemo<ViewStyle>(
    () => ({
      flexDirection: "row",
      alignItems: align,
      justifyContent: justify,
      flexWrap: wrap ? "wrap" : "nowrap",
      gap,
      flexGrow: grow ? 1 : 0,
    }),
    [gap, wrap, align, justify, grow],
  );
  return <View style={style}>{children}</View>;
}

export function Stack({
  children,
  gap = space.md,
  flex,
}: {
  children: ReactNode;
  gap?: number;
  flex?: boolean;
}) {
  const style = useMemo<ViewStyle>(
    () => (flex ? { flex: 1, minWidth: 0, minHeight: 0, gap } : { gap }),
    [gap, flex],
  );
  return <View style={style}>{children}</View>;
}

const DEMO_TINT = alpha(BREEZE.sun, 0.25);

export function DemoPill() {
  const { theme } = useKit();
  return (
    <Pill label="Demo" color={theme.colors.statusWarning} tint={DEMO_TINT} icon="FlaskConical" />
  );
}
