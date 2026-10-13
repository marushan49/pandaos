import { describe, expect, it } from "vitest";
import { contentBlockHtml, contentBlockPlainText } from "./format";

const email = [
  "Hallo **Thomas**,",
  "",
  "bitte *prüfen*:",
  "",
  "1. Fall 14:17",
  "2. Fall 14:42",
  "",
  "- Preprod",
  "- [Portal](https://app.example.com)",
  "",
  "## Ergebnis",
  "",
  "| Fall | Ergebnis |",
  "| --- | --- |",
  "| 14:17 | ok |",
].join("\n");

describe("contentBlockHtml", () => {
  it("renders formatting, lists, links and tables with inline cell styles", () => {
    const html = contentBlockHtml(email);
    expect(html).toContain("<strong>Thomas</strong>");
    expect(html).toContain("<em>prüfen</em>");
    expect(html).toContain("<ol>");
    expect(html).toContain('<a href="https://app.example.com">Portal</a>');
    expect(html).toContain('<table style="border-collapse:collapse">');
    expect(html).toContain('<th style="border:1px solid');
  });

  it("escapes raw html", () => {
    expect(contentBlockHtml("<script>x</script>")).not.toContain("<script>");
  });
});

describe("contentBlockPlainText", () => {
  it("drops markdown syntax and keeps structure", () => {
    expect(contentBlockPlainText(email)).toBe(
      [
        "Hallo Thomas,",
        "",
        "bitte prüfen:",
        "",
        "1. Fall 14:17",
        "2. Fall 14:42",
        "",
        "- Preprod",
        "- Portal (https://app.example.com)",
        "",
        "Ergebnis",
        "",
        "Fall\tErgebnis",
        "14:17\tok",
      ].join("\n"),
    );
  });
});
