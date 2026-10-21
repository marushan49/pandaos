import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isUsageExhaustedError,
  resumeAction,
  USAGE_NOTICE_MAX_CHARS,
  usageFromSources,
  usageResetAt,
} from "./usage";

const CLAUDE_MONTHLY =
  "You've hit your monthly spend limit · raise it at claude.ai/settings/usage?from=cc_cli_limit_message · your session limit resets 12am (Europe/Warsaw)";

test("detects Claude's monthly spend-limit assistant message", () => {
  assert.equal(isUsageExhaustedError(CLAUDE_MONTHLY), true);
  assert.equal(
    isUsageExhaustedError("You've hit your limit · resets 8pm (America/Los_Angeles)"),
    true,
  );
  assert.equal(isUsageExhaustedError("usage limit reached; try again in 5 hours"), true);
  assert.equal(isUsageExhaustedError("Input length exceeds the context window limit"), false);
});

test("parses Claude's 12am Europe/Warsaw reset from the message timestamp", () => {
  const observed = new Date("2026-09-10T20:18:39.177Z");
  const resetAt = usageResetAt(CLAUDE_MONTHLY, observed);
  assert.ok(resetAt);
  assert.equal(resetAt.toISOString(), "2026-09-10T22:00:00.000Z");
  assert.equal(resumeAction(resetAt, new Date("2026-09-10T21:59:59.000Z")), "schedule");
  assert.equal(resumeAction(resetAt, new Date("2026-09-10T22:00:00.000Z")), "continue");
  assert.equal(resumeAction(resetAt, new Date("2026-09-11T08:00:00.000Z")), "continue");
});

test("continue is the action when no renewal time is parseable", () => {
  assert.equal(resumeAction(null), "continue");
  assert.equal(isUsageExhaustedError("insufficient quota"), true);
  assert.equal(usageResetAt("insufficient quota", "2026-09-10T12:00:00.000Z"), null);
});

test("relative renewal windows still parse", () => {
  const observed = new Date("2026-09-10T12:00:00.000Z");
  const resetAt = usageResetAt("rate limit exceeded; try again in 2 hours", observed);
  assert.ok(resetAt);
  assert.equal(resetAt.toISOString(), "2026-09-10T14:00:00.000Z");
});

test("usageFromSources prefers the first parseable reset among exhausted texts", () => {
  const match = usageFromSources([
    { text: "still working", observedAt: "2026-09-10T20:00:00.000Z" },
    { text: CLAUDE_MONTHLY, observedAt: "2026-09-10T20:18:39.177Z" },
  ]);
  assert.equal(match.exhausted, true);
  assert.equal(match.resetAt?.toISOString(), "2026-09-10T22:00:00.000Z");
});

test("ignores long replies that only quote a usage-limit notice", () => {
  const quoted = `${"Here is what the other agent said.\n".repeat(40)}\n${CLAUDE_MONTHLY}`;
  assert.equal(quoted.length > USAGE_NOTICE_MAX_CHARS, true);
  const match = usageFromSources([
    { text: quoted, observedAt: "2026-09-10T20:18:39.177Z", maxChars: USAGE_NOTICE_MAX_CHARS },
  ]);
  assert.equal(match.exhausted, false);
});

// Ordinalsuffixe, wie OpenAI sie in der Kontingentmeldung schickt.
// Lokaler Patch am 11.09.2026, nicht veroeffentlicht.
const ORDINAL_OBSERVED = new Date("2026-09-11T00:50:00Z");
const ORDINAL_PREFIX = "You have hit your usage limit. try again at ";

for (const [phrase, tag] of [
  ["Sep 1st, 2026 3:25 AM", "2026-09-01"],
  ["Sep 2nd, 2026 3:25 AM", "2026-09-02"],
  ["Sep 3rd, 2026 3:25 AM", "2026-09-03"],
  ["Sep 4th, 2026 3:25 AM", "2026-09-04"],
  ["Sep 15th, 2026 3:25 AM", "2026-09-15"],
  ["Sep 21st, 2026 3:25 AM", "2026-09-21"],
  ["Sep 22nd, 2026 3:25 AM", "2026-09-22"],
  ["Sep 23rd, 2026 3:25 AM", "2026-09-23"],
] as Array<[string, string]>) {
  test(`parses the ordinal date ${phrase}`, () => {
    const reset = usageResetAt(ORDINAL_PREFIX + phrase + ".", ORDINAL_OBSERVED);
    assert.ok(reset, `no reset parsed for ${phrase}`);
    const local = `${reset!.getFullYear()}-${String(reset!.getMonth() + 1).padStart(2, "0")}-${String(reset!.getDate()).padStart(2, "0")}`;
    assert.equal(local, tag);
    assert.equal(reset!.getHours(), 3);
    assert.equal(reset!.getMinutes(), 25);
  });
}

test("does not invent a reset for the 31st of September", () => {
  assert.equal(usageResetAt(ORDINAL_PREFIX + "Sep 31st, 2026 3:25 AM.", ORDINAL_OBSERVED), null);
});
