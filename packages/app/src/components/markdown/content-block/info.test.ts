import { describe, expect, it } from "vitest";
import { parseContentBlockInfo } from "./info";

describe("parseContentBlockInfo", () => {
  it("accepts the bare keyword", () => {
    expect(parseContentBlockInfo("writing")).toEqual({ kind: "text", title: null });
  });

  it("keeps the rest of the line as the title", () => {
    expect(parseContentBlockInfo("writing Re: Angebot (final)")).toEqual({
      kind: "text",
      title: "Re: Angebot (final)",
    });
  });

  it("maps every content type keyword", () => {
    expect(parseContentBlockInfo("writing-rich Nachtrag")?.kind).toBe("rich");
    expect(parseContentBlockInfo("email Re: Deckungsprüfung")).toEqual({
      kind: "email",
      title: "Re: Deckungsprüfung",
    });
    expect(parseContentBlockInfo("document Protokoll")?.kind).toBe("document");
    expect(parseContentBlockInfo("Prompt Review")?.kind).toBe("prompt");
  });

  it("ignores fences that only start with a keyword", () => {
    expect(parseContentBlockInfo("writingsample")).toBeNull();
    expect(parseContentBlockInfo("emails")).toBeNull();
  });

  it("ignores code fences and blank info strings", () => {
    expect(parseContentBlockInfo("ts")).toBeNull();
    expect(parseContentBlockInfo("json")).toBeNull();
    expect(parseContentBlockInfo(null)).toBeNull();
    expect(parseContentBlockInfo("   ")).toBeNull();
  });
});
