import { describe, expect, it } from "vitest";
import { toggleHeading, wrapSelection } from "./editor";

describe("wrapSelection", () => {
  it("wraps and unwraps the selected text", () => {
    const bold = wrapSelection("Hallo Thomas", { start: 6, end: 12 }, "**", "fett");
    expect(bold.value).toBe("Hallo **Thomas**");
    expect(wrapSelection(bold.value, bold.selection, "**", "fett").value).toBe("Hallo Thomas");
  });

  it("inserts a placeholder without a selection", () => {
    expect(wrapSelection("a ", { start: 2, end: 2 }, "*", "kursiv").value).toBe("a *kursiv*");
  });
});

describe("toggleHeading", () => {
  it("toggles a heading on the current line", () => {
    const on = toggleHeading("eins\nzwei", { start: 7, end: 7 });
    expect(on.value).toBe("eins\n## zwei");
    expect(toggleHeading(on.value, on.selection).value).toBe("eins\nzwei");
  });
});
