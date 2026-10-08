import { describe, expect, it } from "vitest";
import {
  buildSuggestions,
  inlineCompletion,
  isAddressLike,
  resolveTypedInput,
  toHistoryUrl,
} from "./suggestions";

const NOW = Date.UTC(2026, 9, 8);
const DAY = 24 * 60 * 60 * 1000;

function entry(url: string, visitCount: number, daysAgo: number, title = "") {
  return { url, title, visitCount, lastVisitedAt: NOW - daysAgo * DAY };
}

describe("buildSuggestions", () => {
  it("lists tabs, then history by frequency and recency, then logins, then the typed row", () => {
    const rows = buildSuggestions({
      query: "git",
      tabs: [{ tabId: "t1", title: "GitHub", url: "https://github.com/a" }],
      history: [
        entry("https://gitlab.com", 1, 1),
        entry("https://github.com/b", 9, 1),
        entry("https://old-git.example", 9, 200),
        entry("https://other.com", 50, 0),
      ],
      loginOrigins: ["https://git.example.org", "https://github.com"],
      now: NOW,
    });
    expect(rows.map((row) => row.id)).toEqual([
      "tab:t1",
      "history:https://github.com/b",
      "history:https://gitlab.com",
      "history:https://old-git.example",
      "login:https://git.example.org",
      "search:git",
    ]);
  });

  it("is capped at eight rows with the typed row last", () => {
    const history = Array.from({ length: 20 }, (_, index) =>
      entry(`https://site${index}.com`, 1, index),
    );
    const tabs = Array.from({ length: 5 }, (_, index) => ({
      tabId: `t${index}`,
      title: `site tab ${index}`,
      url: `https://tab${index}.com`,
    }));
    const rows = buildSuggestions({
      query: "site",
      tabs,
      history,
      loginOrigins: ["https://site-login.com"],
      now: NOW,
    });
    expect(rows).toHaveLength(8);
    expect(rows.slice(0, 3).every((row) => row.kind === "tab")).toBe(true);
    expect(rows[7]?.kind).toBe("search");
  });

  it("hides history for an open tab and logins for a host already listed", () => {
    const rows = buildSuggestions({
      query: "example",
      tabs: [{ tabId: "t1", title: "Example", url: "https://example.com/page?x=1" }],
      history: [entry("https://example.com/page", 3, 1), entry("https://example.net", 1, 1)],
      loginOrigins: ["https://example.net", "https://example.org"],
      now: NOW,
    });
    expect(rows.map((row) => row.id)).toEqual([
      "tab:t1",
      "history:https://example.net",
      "login:https://example.org",
      "search:example",
    ]);
  });

  it("offers Open for an address and nothing for an empty query", () => {
    const rows = buildSuggestions({
      query: "example.com/docs",
      tabs: [],
      history: [],
      loginOrigins: [],
      now: NOW,
    });
    expect(rows).toEqual([
      { kind: "open", id: "open:https://example.com/docs", url: "https://example.com/docs" },
    ]);
    expect(
      buildSuggestions({ query: "  ", tabs: [], history: [], loginOrigins: [], now: NOW }),
    ).toEqual([]);
  });
});

describe("typed input", () => {
  it("tells addresses from search text", () => {
    expect(isAddressLike("github.com")).toBe(true);
    expect(isAddressLike("localhost:3000/app")).toBe(true);
    expect(isAddressLike("192.168.0.1")).toBe(true);
    expect(isAddressLike("https://example.com/a b")).toBe(false);
    expect(isAddressLike("best pizza")).toBe(false);
    expect(isAddressLike("pizza")).toBe(false);
  });

  it("resolves addresses to urls and everything else to a Google search", () => {
    expect(resolveTypedInput("github.com")).toBe("https://github.com");
    expect(resolveTypedInput("localhost:3000")).toBe("http://localhost:3000");
    expect(resolveTypedInput("best pizza")).toBe("https://www.google.com/search?q=best%20pizza");
  });
});

describe("toHistoryUrl", () => {
  it("keeps origin and path and drops query and hash", () => {
    expect(toHistoryUrl("https://example.com/a/b/?q=1#top")).toEqual({
      url: "https://example.com/a/b",
      titleAllowed: false,
    });
    expect(toHistoryUrl("https://example.com/")).toEqual({
      url: "https://example.com",
      titleAllowed: true,
    });
  });

  it("refuses credentials, tokens, long queries, secret paths and other schemes", () => {
    expect(toHistoryUrl("https://user:pw@example.com/")).toBeNull();
    expect(toHistoryUrl("https://example.com/?access_token=abc")).toBeNull();
    expect(toHistoryUrl("https://example.com/cb#id_token=abc")).toBeNull();
    expect(toHistoryUrl(`https://example.com/?q=${"a".repeat(300)}`)).toBeNull();
    expect(toHistoryUrl("https://example.com/reset/k3j2h4g5f6d7s8a9q1w2e3r4t5y6")).toBeNull();
    expect(toHistoryUrl("https://example.com/u/123e4567-e89b-12d3-a456-426614174000")).toBeNull();
    expect(toHistoryUrl("about:blank")).toBeNull();
    expect(toHistoryUrl("file:///etc/passwd")).toBeNull();
  });
});

describe("inlineCompletion", () => {
  const rows = buildSuggestions({
    query: "git",
    tabs: [],
    history: [entry("https://github.com/pandaos", 4, 1)],
    loginOrigins: [],
    now: NOW,
  });

  it("completes the typed prefix from the first matching address", () => {
    expect(inlineCompletion("git", rows, -1)).toBe("github.com/pandaos");
    expect(inlineCompletion("https://git", rows, -1)).toBe("https://github.com/pandaos");
  });

  it("takes the selected row's address and skips the search row", () => {
    expect(inlineCompletion("pandaos", rows, 0)).toBe("github.com/pandaos");
    expect(inlineCompletion("git", rows, rows.length - 1)).toBeNull();
    expect(inlineCompletion("zzz", rows, -1)).toBeNull();
  });
});
