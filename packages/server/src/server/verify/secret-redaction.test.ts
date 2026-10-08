import { describe, expect, it } from "vitest";

import {
  createBrowserSecretRedactor,
  createSecretRedactor,
  isOriginAllowed,
  normalizeOrigin,
} from "./secret-redaction.js";

describe("SecretRedactor", () => {
  it("replaces every occurrence of registered secrets", () => {
    const redactor = createSecretRedactor();
    redactor.addSecret("s3cr3t-pw");
    redactor.addSecret("admin@example.com");

    expect(redactor.redact("login with admin@example.com / s3cr3t-pw failed")).toBe(
      "login with [REDACTED] / [REDACTED] failed",
    );
    expect(redactor.redact("nothing sensitive here")).toBe("nothing sensitive here");
  });

  it("redacts longest secrets first so overlapping values stay fully covered", () => {
    const redactor = createSecretRedactor();
    redactor.addSecret("short");
    redactor.addSecret("short-and-long");

    expect(redactor.redact("value short-and-long here")).toBe("value [REDACTED] here");
  });

  it("ignores empty values instead of redacting everything", () => {
    const redactor = createSecretRedactor();
    redactor.addSecret("");

    expect(redactor.redact("unchanged")).toBe("unchanged");
    expect(redactor.secretCount).toBe(0);
  });
});

describe("browser secret redaction", () => {
  const redactor = createBrowserSecretRedactor({
    passwords: ["pw-from-vault"],
    cookieValues: ["sess-0123456789", "1", "true"],
    fieldValues: ["typed-secret", ""],
  });

  it("replaces passwords, long cookie values and password field values", () => {
    expect(redactor.redact("a pw-from-vault b sess-0123456789 c typed-secret d")).toBe(
      "a [geschwärzt] b [geschwärzt] c [geschwärzt] d",
    );
  });

  it("keeps short cookie values like 1 and true", () => {
    expect(redactor.redact("count=1 flag=true")).toBe("count=1 flag=true");
  });

  it("leaves text untouched when nothing matches", () => {
    const text = '{"a":"plain","b":[1,2]}';
    expect(redactor.redact(text)).toBe(text);
    const value = { a: "plain", b: [1, 2], c: null };
    expect(redactor.redactDeep(value)).toEqual(value);
  });

  it("keeps JSON valid even when a secret contains JSON syntax characters", () => {
    const quoted = createBrowserSecretRedactor({
      passwords: ['pa"ss\\{[,:'],
      cookieValues: [],
      fieldValues: [],
    });
    const result = quoted.redactDeep({ note: 'x pa"ss\\{[,: y', list: ['pa"ss\\{[,:'] });
    expect(JSON.parse(JSON.stringify(result))).toEqual({
      note: "x [geschwärzt] y",
      list: ["[geschwärzt]"],
    });
  });

  it("redacts keys and numeric values that equal a secret", () => {
    const numeric = createBrowserSecretRedactor({
      passwords: [],
      cookieValues: ["12345678"],
      fieldValues: [],
    });
    expect(numeric.redactDeep({ "k-12345678": 12345678, other: 7 })).toEqual({
      "k-[geschwärzt]": "[geschwärzt]",
      other: 7,
    });
  });

  it("does not corrupt the placeholder with short secrets", () => {
    const short = createBrowserSecretRedactor({
      passwords: ["e", "secret"],
      cookieValues: [],
      fieldValues: [],
    });
    expect(short.redact("secret")).toBe("[geschwärzt]");
  });
});

describe("origin allowlist", () => {
  it("normalizes http origins with explicit ports", () => {
    expect(normalizeOrigin("http://127.0.0.1:4001/en/case/1")).toBe("http://127.0.0.1:4001");
    expect(normalizeOrigin("https://dev.example.com:443/x")).toBe("https://dev.example.com");
    expect(normalizeOrigin("http://EXAMPLE.com:80/x")).toBe("http://example.com");
  });

  it("returns null for non-http URLs", () => {
    expect(normalizeOrigin("file:///etc/passwd")).toBeNull();
    expect(normalizeOrigin("not a url")).toBeNull();
  });

  it("matches exact origins only", () => {
    const allowed = ["http://127.0.0.1:4001", "https://dev.example.com"];
    expect(isOriginAllowed("http://127.0.0.1:4001/login", allowed)).toBe(true);
    expect(isOriginAllowed("https://dev.example.com/a?b=c", allowed)).toBe(true);
  });

  it("rejects lookalikes, subdomains, ports, and scheme swaps", () => {
    const allowed = ["http://127.0.0.1:4001", "https://dev.example.com"];
    expect(isOriginAllowed("http://127.0.0.1:4002/login", allowed)).toBe(false);
    expect(isOriginAllowed("https://evil-dev.example.com/", allowed)).toBe(false);
    expect(isOriginAllowed("https://dev.example.com.evil.com/", allowed)).toBe(false);
    expect(isOriginAllowed("https://127.0.0.1:4001/", allowed)).toBe(false);
    expect(isOriginAllowed("http://dev.example.com/", allowed)).toBe(false);
  });

  it("fails closed on invalid inputs", () => {
    expect(isOriginAllowed("not a url", ["http://127.0.0.1:4001"])).toBe(false);
    expect(isOriginAllowed("http://127.0.0.1:4001/", [])).toBe(false);
    expect(isOriginAllowed("http://127.0.0.1:4001/", ["not-an-origin"])).toBe(false);
  });
});
