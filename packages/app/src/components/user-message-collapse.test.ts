import { describe, expect, it } from "vitest";

import {
  countPromptLines,
  getPromptVisibleLines,
  mayNeedPromptCollapse,
  shouldCollapsePrompt,
} from "./user-message-collapse";

describe("user message collapse", () => {
  it("shows 6 lines on compact and 10 on desktop", () => {
    expect(getPromptVisibleLines(true)).toBe(6);
    expect(getPromptVisibleLines(false)).toBe(10);
  });

  it("skips measuring for short messages", () => {
    expect(mayNeedPromptCollapse("fix the build", 6)).toBe(false);
    expect(mayNeedPromptCollapse("a\nb\nc\nd\ne\nf\ng", 6)).toBe(false);
  });

  it("measures messages with many line breaks or many characters", () => {
    expect(mayNeedPromptCollapse("a\nb\nc\nd\ne\nf\ng\nh", 6)).toBe(true);
    expect(mayNeedPromptCollapse("x".repeat(200), 6)).toBe(true);
  });

  it("derives the total line count from the clamped and full heights", () => {
    expect(countPromptLines({ fullHeight: 14 * 21, clampedHeight: 6 * 21, visibleLines: 6 })).toBe(
      14,
    );
    expect(countPromptLines({ fullHeight: 3 * 21, clampedHeight: 3 * 21, visibleLines: 6 })).toBe(
      6,
    );
    expect(countPromptLines({ fullHeight: 0, clampedHeight: 0, visibleLines: 6 })).toBe(0);
  });

  it("collapses only when at least two lines would be hidden", () => {
    expect(shouldCollapsePrompt(7, 6)).toBe(false);
    expect(shouldCollapsePrompt(8, 6)).toBe(true);
    expect(shouldCollapsePrompt(11, 10)).toBe(false);
    expect(shouldCollapsePrompt(12, 10)).toBe(true);
  });
});
