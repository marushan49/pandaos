import { beforeEach, describe, expect, it, vi } from "vitest";
import { darkHighlightColors, resolveSyntaxColors } from "@getpaseo/highlight";
import { DEFAULT_UI_FONT_STACK, REGISTERED_THEMES } from "@/styles/theme";
import { applyAppearance, type AppearanceInput } from "./apply";

const { runtime, updateTheme } = vi.hoisted(() => {
  const updateThemeSpy = vi.fn();
  return {
    runtime: { themeName: undefined as string | undefined, updateTheme: updateThemeSpy },
    updateTheme: updateThemeSpy,
  };
});
vi.mock("react-native-unistyles", () => ({ UnistylesRuntime: runtime }));

const ALL_THEME_KEYS = Object.keys(REGISTERED_THEMES);

type ThemeUpdater = (theme: FakeTheme) => FakeTheme;

interface FakeTheme {
  colorScheme: "light" | "dark";
  fontFamily: { ui: string; mono: string; display: string };
  fontSize: {
    code: number;
    content: number;
    sm: number;
    base: number;
    lg: number;
    xl: number;
    "2xl": number;
    "3xl": number;
    "4xl": number;
  };
  lineHeight: { diff: number };
  contentMaxWidth: number;
  colors: { foreground: string; syntax: Record<string, string>; accent?: string; ring?: string };
}

function makeFakeTheme(): FakeTheme {
  return {
    colorScheme: "dark",
    fontFamily: { ui: "seed-ui-stack", mono: "seed-mono-stack", display: "seed-display-stack" },
    fontSize: {
      code: 12,
      content: 15,
      sm: 12,
      base: 14,
      lg: 16,
      xl: 18,
      "2xl": 20,
      "3xl": 22,
      "4xl": 26,
    },
    lineHeight: { diff: 22 },
    contentMaxWidth: 820,
    colors: { foreground: "#fff", syntax: {} },
  };
}

function makeInput(overrides: Partial<AppearanceInput> = {}): AppearanceInput {
  return {
    uiFontFamily: "",
    monoFontFamily: "",
    displayFontFamily: "",
    uiBaseFontSize: 14,
    contentFontSize: 15,
    codeFontSize: 12,
    contentMaxWidth: 820,
    syntaxTheme: "one",
    accentColor: "",
    ...overrides,
  };
}

function runCapturedUpdater(call = 0): FakeTheme {
  const updater = updateTheme.mock.calls[call]?.[1] as unknown as ThemeUpdater;
  return updater(makeFakeTheme());
}

describe("applyAppearance", () => {
  beforeEach(() => {
    updateTheme.mockClear();
    runtime.themeName = undefined;
  });

  it("patches every registered Unistyles theme exactly once", () => {
    applyAppearance(makeInput());

    expect(updateTheme).toHaveBeenCalledTimes(ALL_THEME_KEYS.length);
    expect(updateTheme.mock.calls.map((call) => call[0])).toEqual([...ALL_THEME_KEYS]);
  });

  it("patches the active theme before inactive registry entries", () => {
    runtime.themeName = "darkPureBlack";

    applyAppearance(makeInput({ uiBaseFontSize: 15 }));

    expect(updateTheme.mock.calls.map((call) => call[0])).toEqual([
      "darkPureBlack",
      ...ALL_THEME_KEYS.filter((key) => key !== "darkPureBlack"),
    ]);
  });

  it("patches the content max width into the theme", () => {
    applyAppearance(makeInput({ contentMaxWidth: 1600 }));

    expect(runCapturedUpdater().contentMaxWidth).toBe(1600);
  });

  it("resolves an empty UI font family to the default stack", () => {
    applyAppearance(makeInput({ uiFontFamily: "" }));

    expect(runCapturedUpdater().fontFamily.ui).toBe(DEFAULT_UI_FONT_STACK);
  });

  it("passes a non-empty UI font family through trimmed", () => {
    applyAppearance(makeInput({ uiFontFamily: "  Menlo  " }));

    expect(runCapturedUpdater().fontFamily.ui).toBe("Menlo");
  });

  it("scales the whole UI ramp proportionally while preserving ratios", () => {
    applyAppearance(makeInput({ uiBaseFontSize: 15 }));

    const { fontSize } = runCapturedUpdater();
    expect(fontSize.base).toBe(15);
    expect(fontSize.sm).toBe(13);
    expect(fontSize.lg).toBe(17);
    expect(fontSize.xl).toBe(19);
    expect(fontSize["4xl"]).toBe(28);
  });

  it("derives the UI ramp from the canonical sizes, not the live theme (no compounding)", () => {
    applyAppearance(makeInput({ uiBaseFontSize: 15 }));

    const updater = updateTheme.mock.calls[0]?.[1] as unknown as ThemeUpdater;
    const alreadyScaled = makeFakeTheme();
    alreadyScaled.fontSize = {
      code: 4,
      content: 4,
      sm: 4,
      base: 4,
      lg: 4,
      xl: 4,
      "2xl": 4,
      "3xl": 4,
      "4xl": 4,
    };

    const { fontSize } = updater(alreadyScaled);
    expect(fontSize.base).toBe(15);
    expect(fontSize.lg).toBe(17);
  });

  it("leaves the UI ramp at authored sizes when only the code size changes", () => {
    applyAppearance(makeInput({ uiBaseFontSize: 14, codeFontSize: 10 }));

    const { fontSize } = runCapturedUpdater();
    expect(fontSize.base).toBe(14);
    expect(fontSize.lg).toBe(16);
    expect(fontSize.sm).toBe(12);
    expect(fontSize.code).toBe(10);
  });

  it("sets content size independently of the interface and code sizes", () => {
    applyAppearance(makeInput({ uiBaseFontSize: 14, contentFontSize: 19, codeFontSize: 10 }));

    const { fontSize } = runCapturedUpdater();
    expect(fontSize.base).toBe(14);
    expect(fontSize.content).toBe(19);
    expect(fontSize.code).toBe(10);
  });

  it("sets fontSize.code to codeFontSize regardless of the UI font size", () => {
    applyAppearance(makeInput({ uiBaseFontSize: 14, codeFontSize: 18 }));

    expect(runCapturedUpdater().fontSize.code).toBe(18);
  });

  it("couples lineHeight.diff to the code font size", () => {
    applyAppearance(makeInput({ codeFontSize: 18 }));

    expect(runCapturedUpdater().lineHeight.diff).toBe(Math.round(18 * 1.5));
  });

  it("swaps colors.syntax to the resolved palette for the named theme", () => {
    applyAppearance(makeInput({ syntaxTheme: "dracula" }));

    const { colors } = runCapturedUpdater();
    expect(colors.syntax).toEqual(resolveSyntaxColors("dracula", "dark"));
  });

  it("resolves a syntax theme using the theme's own color scheme", () => {
    applyAppearance(makeInput({ syntaxTheme: "github" }));

    expect(runCapturedUpdater().colors.syntax).toEqual(darkHighlightColors);
    expect(runCapturedUpdater().colors.syntax).toEqual(resolveSyntaxColors("github", "dark"));
  });

  it("applies a picked accent and restores the theme's own accent when cleared", () => {
    applyAppearance(makeInput({ accentColor: "#e0508f" }));
    const picked = runCapturedUpdater();
    expect(picked.colors.accent).toBe("#e0508f");
    expect(picked.colors.ring).toBe("#e0508f");

    updateTheme.mockClear();
    applyAppearance(makeInput({ accentColor: "" }));
    const key = updateTheme.mock.calls[0]?.[0] as keyof typeof REGISTERED_THEMES;
    expect(runCapturedUpdater().colors.accent).toBe(REGISTERED_THEMES[key].colors.accent);
  });
});
