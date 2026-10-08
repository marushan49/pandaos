import { normalizeBrowserUrl } from "./store/state";

export const MAX_SUGGESTIONS = 8;

const MAX_LISTED_SUGGESTIONS = MAX_SUGGESTIONS - 1;
const MAX_TAB_SUGGESTIONS = 3;
const MAX_HISTORY_SUGGESTIONS = 4;
const MAX_LOGIN_SUGGESTIONS = 2;
const MAX_HISTORY_QUERY_LENGTH = 200;
const MAX_HISTORY_PATH_LENGTH = 200;
const RECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;
const SENSITIVE_QUERY_KEY =
  /token|passw|pwd|secret|auth|session|credential|otp|signature|^sig$|^key$|api[-_]?key|^code$/i;
const SENSITIVE_HASH = /token|passw|secret|auth|session|code=|key=/i;
const SCHEME_PREFIX = /^[a-z][a-z\d+.-]*:\/\//i;
const ADDRESS_PATTERN =
  /^(?:[a-z][a-z\d+.-]*:\/\/\S+|(?:localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[\da-f:.]+\]|(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,})(?::\d{1,5})?(?:[/?#]\S*)?)$/i;

export interface SuggestionTab {
  tabId: string;
  title: string;
  url: string;
}

export interface SuggestionHistoryEntry {
  url: string;
  title: string;
  visitCount: number;
  lastVisitedAt: number;
}

export type UrlSuggestion =
  | { kind: "tab"; id: string; tabId: string; title: string; url: string }
  | { kind: "history"; id: string; title: string; url: string }
  | { kind: "login"; id: string; title: string; url: string }
  | { kind: "open"; id: string; url: string }
  | { kind: "search"; id: string; query: string; url: string };

export function isAddressLike(text: string): boolean {
  return ADDRESS_PATTERN.test(text.trim());
}

export function buildSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`;
}

export function resolveTypedInput(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "about:blank" || isAddressLike(trimmed) || trimmed === "") {
    return normalizeBrowserUrl(trimmed);
  }
  return buildSearchUrl(trimmed);
}

export function displayUrl(url: string): string {
  return url.replace(/^https:\/\//i, "").replace(/\/$/, "");
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function stripScheme(value: string): string {
  return value.replace(SCHEME_PREFIX, "").replace(/^www\./i, "");
}

const UUID_SEGMENT = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

function looksLikeSecretSegment(segment: string): boolean {
  if (UUID_SEGMENT.test(segment)) {
    return true;
  }
  return (
    segment.length >= 24 &&
    /^[\w-]+$/.test(segment) &&
    /\d/.test(segment) &&
    /[a-z]/i.test(segment) &&
    segment.split("-").length <= 3
  );
}

export function toHistoryUrl(raw: string): { url: string; titleAllowed: boolean } | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  if (parsed.username || parsed.password) {
    return null;
  }
  if (parsed.search.length > MAX_HISTORY_QUERY_LENGTH) {
    return null;
  }
  for (const key of parsed.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEY.test(key)) {
      return null;
    }
  }
  if (SENSITIVE_HASH.test(parsed.hash)) {
    return null;
  }
  if (parsed.pathname.length > MAX_HISTORY_PATH_LENGTH) {
    return null;
  }
  if (parsed.pathname.split("/").some(looksLikeSecretSegment)) {
    return null;
  }
  const path = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/$/, "") : "";
  return { url: `${parsed.origin}${path}`, titleAllowed: parsed.search === "" };
}

function queryTokens(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean).map(stripScheme).filter(Boolean);
}

function matchesAll(tokens: readonly string[], title: string, url: string): boolean {
  const haystack = `${title.toLowerCase()} ${stripScheme(url).toLowerCase()}`;
  return tokens.every((token) => haystack.includes(token));
}

function historyScore(
  entry: SuggestionHistoryEntry,
  now: number,
  firstToken: string | undefined,
): number {
  const age = Math.max(0, now - entry.lastVisitedAt);
  const base = entry.visitCount / (1 + age / RECENCY_HALF_LIFE_MS);
  return firstToken && hostOf(entry.url).toLowerCase().startsWith(firstToken) ? base * 2 : base;
}

function typedRow(query: string): UrlSuggestion {
  const trimmed = query.trim();
  if (isAddressLike(trimmed)) {
    const url = normalizeBrowserUrl(trimmed);
    return { kind: "open", id: `open:${url}`, url };
  }
  return { kind: "search", id: `search:${trimmed}`, query: trimmed, url: buildSearchUrl(trimmed) };
}

export function buildSuggestions(input: {
  query: string;
  tabs: readonly SuggestionTab[];
  history: readonly SuggestionHistoryEntry[];
  loginOrigins: readonly string[];
  now: number;
}): UrlSuggestion[] {
  const tokens = queryTokens(input.query);
  if (input.query.trim() === "" || tokens.length === 0) {
    return [];
  }

  const tabRows: UrlSuggestion[] = input.tabs
    .filter((tab) => matchesAll(tokens, tab.title, tab.url))
    .slice(0, MAX_TAB_SUGGESTIONS)
    .map((tab) => ({
      kind: "tab",
      id: `tab:${tab.tabId}`,
      tabId: tab.tabId,
      title: tab.title,
      url: tab.url,
    }));

  const tabKeys = new Set(
    input.tabs.map((tab) => toHistoryUrl(tab.url)?.url).filter((key) => key !== undefined),
  );
  const historyRows: UrlSuggestion[] = input.history
    .filter((entry) => !tabKeys.has(entry.url) && matchesAll(tokens, entry.title, entry.url))
    .map((entry) => ({ entry, score: historyScore(entry, input.now, tokens[0]) }))
    .sort((a, b) => b.score - a.score || b.entry.lastVisitedAt - a.entry.lastVisitedAt)
    .slice(0, MAX_HISTORY_SUGGESTIONS)
    .map(({ entry }) => ({
      kind: "history",
      id: `history:${entry.url}`,
      title: entry.title,
      url: entry.url,
    }));

  const seenHosts = new Set([...tabRows, ...historyRows].map((row) => hostOf(row.url)));
  const loginRows: UrlSuggestion[] = [];
  for (const origin of input.loginOrigins) {
    const host = hostOf(origin);
    if (!host || seenHosts.has(host) || !matchesAll(tokens, host, origin)) {
      continue;
    }
    seenHosts.add(host);
    loginRows.push({ kind: "login", id: `login:${origin}`, title: host, url: origin });
    if (loginRows.length >= MAX_LOGIN_SUGGESTIONS) {
      break;
    }
  }

  const listed = [...tabRows, ...historyRows, ...loginRows].slice(0, MAX_LISTED_SUGGESTIONS);
  return [...listed, typedRow(input.query)];
}

export function inlineCompletion(
  query: string,
  suggestions: readonly UrlSuggestion[],
  selectedIndex: number,
): string | null {
  const typed = query.trim();
  if (!typed) {
    return null;
  }
  const typedHasScheme = SCHEME_PREFIX.test(typed);
  const typedBare = stripScheme(typed).toLowerCase();
  const candidates = selectedIndex >= 0 ? [suggestions[selectedIndex]] : suggestions;
  for (const suggestion of candidates) {
    if (!suggestion || suggestion.kind === "search") {
      continue;
    }
    const bare = stripScheme(suggestion.url).replace(/\/$/, "");
    if (selectedIndex < 0 && !bare.toLowerCase().startsWith(typedBare)) {
      continue;
    }
    const completion = typedHasScheme ? suggestion.url : displayUrl(suggestion.url);
    return completion === typed ? null : completion;
  }
  return null;
}
