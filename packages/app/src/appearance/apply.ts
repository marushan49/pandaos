import { UnistylesRuntime } from "react-native-unistyles";
import { resolveSyntaxColors, type SyntaxThemeId } from "@getpaseo/highlight";
import {
  DEFAULT_UI_FONT_STACK,
  DEFAULT_MONO_FONT_STACK,
  DEFAULT_DISPLAY_FONT_STACK,
  FONT_SIZE,
  PLUGIN_THEME_NAMES,
  REGISTERED_THEMES,
  type Theme,
} from "@/styles/theme";
import { applyRootUiFont } from "./apply-root-font";

const PLUGIN_THEME_KEYS: ReadonlySet<string> = new Set(Object.values(PLUGIN_THEME_NAMES));
const ALL_THEME_KEYS = Object.keys(REGISTERED_THEMES) as (keyof typeof REGISTERED_THEMES)[];

export interface AppearanceInput {
  uiFontFamily: string;
  monoFontFamily: string;
  displayFontFamily: string;
  uiBaseFontSize: number;
  contentFontSize: number;
  codeFontSize: number;
  contentMaxWidth: number;
  syntaxTheme: SyntaxThemeId;
  accentColor: string;
}

function scaleFontSize(
  uiBaseSize: number,
  contentSize: number,
  codeSize: number,
): Theme["fontSize"] {
  const r = uiBaseSize / FONT_SIZE.base;
  return {
    sm: Math.round(FONT_SIZE.sm * r),
    base: Math.round(FONT_SIZE.base * r),
    lg: Math.round(FONT_SIZE.lg * r),
    xl: Math.round(FONT_SIZE.xl * r),
    "2xl": Math.round(FONT_SIZE["2xl"] * r),
    "3xl": Math.round(FONT_SIZE["3xl"] * r),
    "4xl": Math.round(FONT_SIZE["4xl"] * r),
    content: contentSize, // absolute, NOT scaled
    code: codeSize, // absolute, NOT scaled
  };
}

function mixHex(from: string, to: string, amount: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mixed = [0, 1, 2].map((i) =>
    Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * amount)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${mixed.join("")}`;
}

export function applyAppearance(input: AppearanceInput): void {
  const ui = input.uiFontFamily.trim() || DEFAULT_UI_FONT_STACK;
  const mono = input.monoFontFamily.trim() || DEFAULT_MONO_FONT_STACK;
  const display = input.displayFontFamily.trim() || DEFAULT_DISPLAY_FONT_STACK;
  const diffLineHeight = Math.round(input.codeFontSize * 1.5);
  const activeTheme = UnistylesRuntime.themeName;
  const themeKeys = activeTheme
    ? [activeTheme, ...ALL_THEME_KEYS.filter((key) => key !== activeTheme)]
    : ALL_THEME_KEYS;

  for (const key of themeKeys) {
    UnistylesRuntime.updateTheme(key, (t) => {
      const fontFamily = { ui, mono, display };
      const fontSize = scaleFontSize(
        input.uiBaseFontSize,
        input.contentFontSize,
        input.codeFontSize,
      );
      const lineHeight = { ...t.lineHeight, diff: diffLineHeight };
      const base = PLUGIN_THEME_KEYS.has(key) ? t.colors : REGISTERED_THEMES[key].colors;
      const accent: { accent: string; accentBright: string; ring: string } = input.accentColor
        ? {
            accent: input.accentColor,
            accentBright: mixHex(
              input.accentColor,
              "#ffffff",
              t.colorScheme === "dark" ? 0.35 : 0.12,
            ),
            ring: input.accentColor,
          }
        : { accent: base.accent, accentBright: base.accentBright, ring: base.ring };
      const syntax = resolveSyntaxColors(input.syntaxTheme, t.colorScheme);
      if (t.colorScheme === "light") {
        return {
          ...t,
          fontFamily,
          fontSize,
          lineHeight,
          contentMaxWidth: input.contentMaxWidth,
          colors: { ...t.colors, ...accent, syntax },
        };
      }
      return {
        ...t,
        fontFamily,
        fontSize,
        lineHeight,
        contentMaxWidth: input.contentMaxWidth,
        colors: { ...t.colors, ...accent, syntax },
      };
    });
  }

  applyRootUiFont(ui);
}
