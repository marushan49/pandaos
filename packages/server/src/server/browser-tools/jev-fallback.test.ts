import { describe, expect, it } from "vitest";
import { formatUnsureStop, gateConfidence, nextBrowserStepWindow } from "./jev-fallback.js";

describe("gateConfidence", () => {
  it("executes a confident action of any kind", () => {
    expect(
      gateConfidence({ operation: "CLICK", confidence: 0.5, minConfidence: 0.5, unsureSoFar: 2 }),
    ).toBe("execute");
  });

  it("still executes a safe action down to 0.2 and retries below it", () => {
    for (const operation of ["SCROLL_DOWN", "SCROLL_UP", "WAIT"]) {
      expect(
        gateConfidence({ operation, confidence: 0.2, minConfidence: 0.5, unsureSoFar: 0 }),
      ).toBe("execute_unsure");
      expect(
        gateConfidence({ operation, confidence: 0.19, minConfidence: 0.5, unsureSoFar: 0 }),
      ).toBe("retry");
    }
  });

  it("retries an unsure mutation or BLOCKED twice, then stops", () => {
    for (const operation of ["CLICK", "FILL", "PRESS_ENTER", "BACK", "BLOCKED"]) {
      const gate = (unsureSoFar: number) =>
        gateConfidence({ operation, confidence: 0.45, minConfidence: 0.5, unsureSoFar });
      expect([gate(0), gate(1), gate(2)]).toEqual(["retry", "retry", "stop"]);
    }
  });

  it("stops even a safe action once the unsure budget is spent", () => {
    expect(
      gateConfidence({
        operation: "SCROLL_DOWN",
        confidence: 0.3,
        minConfidence: 0.5,
        unsureSoFar: 2,
      }),
    ).toBe("stop");
  });
});

describe("formatUnsureStop", () => {
  it("tells the agent goal, progress, blocker, controls and next step in at most 12 lines", () => {
    const message = formatUnsureStop({
      reason: "Jev was not confident enough to choose a target.",
      operation: "CLICK",
      confidence: 0.31,
      minConfidence: 0.5,
      looks: 2,
      goal: "Open the hours report for October",
      done: ["CLICK @e3", "SCROLL_DOWN"],
      title: "9elf26 HOURS",
      url: "https://hours.example/",
      browserId: "tab-1",
      controls: ['link "9elf26 HOURS" @e1', 'button "Reports" @e4'],
      guess: 'button "Reports" @e4 (0.31)',
    });
    const lines = message.split("\n");

    expect(lines.length).toBeLessThanOrEqual(12);
    expect(lines[0]).toBe(
      "Jev was not confident enough to choose a target. (confidence 0.31, needs 0.50; 2 fresh looks did not settle it).",
    );
    expect(message).toContain("Goal: Open the hours report for October");
    expect(message).toContain("Done so far: CLICK @e3, SCROLL_DOWN");
    expect(message).toContain('Visible controls: link "9elf26 HOURS" @e1, button "Reports" @e4');
    expect(lines.at(-1)).toContain('button "Reports" @e4 (0.31)');
    expect(lines.at(-1)).toContain("browser_click on browserId tab-1");
    expect(message).not.toMatch(/screenshot/i);
  });
});

describe("nextBrowserStepWindow", () => {
  function run(tools: Array<[string, number]>): Array<string | undefined> {
    let steps: number[] = [];
    return tools.map(([tool, now]) => {
      const next = nextBrowserStepWindow({ previous: steps, tool, now });
      steps = next.steps;
      return next.hint;
    });
  }

  it("hints on the 7th single step and every third after it", () => {
    const hints = run(Array.from({ length: 13 }, (_, index) => ["browser_click", index * 1_000]));
    const hinted = hints.flatMap((hint, index) => (hint ? [index + 1] : []));

    expect(hinted).toEqual([7, 10, 13]);
    expect(hints[6]).toContain("Du hast 7 einzelne Browser-Schritte");
  });

  it("forgets steps older than three minutes", () => {
    const hints = run([
      ...Array.from({ length: 6 }, (_, index): [string, number] => ["browser_snapshot", index]),
      ["browser_click", 180_000],
    ]);

    expect(hints.every((hint) => hint === undefined)).toBe(true);
  });

  it("resets on browser_goal or browser_test and ignores other tools", () => {
    const steps = Array.from({ length: 6 }, (_, index): [string, number] => [
      "browser_click",
      index,
    ]);
    expect(run([...steps, ["browser_goal", 6], ["browser_click", 7]]).at(-1)).toBeUndefined();
    expect(run([...steps, ["browser_test", 6], ["browser_click", 7]]).at(-1)).toBeUndefined();
    expect(run([...steps, ["browser_handoff", 6], ["browser_click", 7]]).at(-1)).toContain(
      "Du hast 7",
    );
  });
});
