import { describe, expect, it } from "vitest";
import { findBrowserScreenshot, parseBrowserScreenshotRef } from "./browser-screenshot";

const REF = "evidence://ws-1/evr_abc/run-failure";
const TARGET = { workspaceId: "ws-1", runId: "evr_abc", name: "run-failure" };

describe("browser screenshot reference", () => {
  it("parses an artifact reference and rejects a run reference", () => {
    expect(parseBrowserScreenshotRef(REF)).toEqual(TARGET);
    expect(parseBrowserScreenshotRef("evidence://ws-1/evr_abc")).toBeNull();
    expect(parseBrowserScreenshotRef(undefined)).toBeNull();
  });

  it("finds the reference in browser_test and browser_goal results only", () => {
    const test = {
      type: "unknown" as const,
      input: null,
      output: { structuredContent: { status: "fail", screenshotRef: REF } },
    };
    const goal = {
      type: "unknown" as const,
      input: null,
      output: { structuredContent: { ok: false, result: { screenshotRef: REF } } },
    };
    expect(findBrowserScreenshot("mcp__paseo__browser_test", test)).toEqual(TARGET);
    expect(findBrowserScreenshot("paseo_browser_goal", goal)).toEqual(TARGET);
    expect(findBrowserScreenshot("browser_click", test)).toBeNull();
    expect(findBrowserScreenshot("browser_test", { ...test, output: null })).toBeNull();
  });
});
