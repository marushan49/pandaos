import { describe, expect, it } from "vitest";
import { richWritingHtml } from "./html";

describe("richWritingHtml", () => {
  it("renders a table with inline cell styles for mail clients", () => {
    const html = richWritingHtml("| Fall | Ergebnis |\n| --- | --- |\n| 14:17 | **ok** |");
    expect(html).toContain('<table style="border-collapse:collapse">');
    expect(html).toContain('<th style="border:1px solid');
    expect(html).toContain("<strong>ok</strong>");
  });

  it("escapes raw html", () => {
    expect(richWritingHtml("<script>x</script>")).not.toContain("<script>");
  });
});
