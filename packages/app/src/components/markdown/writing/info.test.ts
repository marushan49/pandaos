import { describe, expect, it } from "vitest";
import { parseWritingFenceInfo } from "./info";

describe("parseWritingFenceInfo", () => {
  it("accepts the bare keyword", () => {
    expect(parseWritingFenceInfo("writing")).toEqual({ title: null, rich: false });
  });

  it("keeps the rest of the line as the title", () => {
    expect(parseWritingFenceInfo("writing Antwort an Herrn Venn")).toEqual({
      title: "Antwort an Herrn Venn",
      rich: false,
    });
  });

  it("keeps punctuation and parentheses in a title", () => {
    expect(parseWritingFenceInfo("writing Re: Angebot (final)")).toEqual({
      title: "Re: Angebot (final)",
      rich: false,
    });
  });

  it("matches the keyword case-insensitively", () => {
    expect(parseWritingFenceInfo("Writing")).toEqual({ title: null, rich: false });
  });

  it("marks the rich variant", () => {
    expect(parseWritingFenceInfo("writing-rich Nachtrag an Thomas")).toEqual({
      title: "Nachtrag an Thomas",
      rich: true,
    });
  });

  it("ignores fences that only start with the keyword", () => {
    expect(parseWritingFenceInfo("writingsample")).toBeNull();
  });

  it("ignores code fences", () => {
    expect(parseWritingFenceInfo("ts")).toBeNull();
    expect(parseWritingFenceInfo("bash")).toBeNull();
  });

  it("ignores an absent or blank info string", () => {
    expect(parseWritingFenceInfo(null)).toBeNull();
    expect(parseWritingFenceInfo(undefined)).toBeNull();
    expect(parseWritingFenceInfo("   ")).toBeNull();
  });
});
