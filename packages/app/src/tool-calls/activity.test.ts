import { describe, expect, it } from "vitest";
import { joinActivityLabels, resolveToolActivity } from "./activity";

const unknownDetail = { type: "unknown", input: null, output: null } as const;

describe("tool activity", () => {
  it("maps tool calls to activities", () => {
    expect(
      resolveToolActivity({
        name: "Bash",
        status: "running",
        error: null,
        detail: { type: "shell", command: "ls" },
      }),
    ).toBe("runningCommand");
    expect(
      resolveToolActivity({
        name: "mcp__paseo__browser_click",
        status: "running",
        error: null,
        detail: unknownDetail,
      }),
    ).toBe("clicking");
    expect(
      resolveToolActivity({
        name: "mcp__paseo__browser_screenshot",
        status: "running",
        error: null,
        detail: unknownDetail,
      }),
    ).toBe("capturingPage");
    expect(
      resolveToolActivity({
        name: "mcp__paseo__list_agents",
        status: "running",
        error: null,
        detail: unknownDetail,
      }),
    ).toBe("callingPandaos");
    expect(
      resolveToolActivity({
        name: "Outlook",
        status: "running",
        error: null,
        detail: unknownDetail,
      }),
    ).toBe("usingTools");
  });

  it("joins the latest three distinct labels and counts the rest", () => {
    expect(joinActivityLabels(["Clicking", "Waiting", "Capturing page"])).toBe(
      "Clicking, waiting, capturing page",
    );
    expect(joinActivityLabels(["Clicking", "Clicking", "Waiting"])).toBe("Clicking, waiting");
    expect(
      joinActivityLabels(["Opening page", "Typing", "Clicking", "Waiting", "Capturing page"]),
    ).toBe("Clicking, waiting, capturing page +2");
    expect(joinActivityLabels([])).toBe("");
  });
});
