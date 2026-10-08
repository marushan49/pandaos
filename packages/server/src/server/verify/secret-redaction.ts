export const REDACTED_PLACEHOLDER = "[REDACTED]";
export const BROWSER_REDACTED_PLACEHOLDER = "[geschwärzt]";
export const MIN_COOKIE_SECRET_LENGTH = 8;

export interface SecretRedactor {
  readonly secretCount: number;
  addSecret(value: string): void;
  redact(text: string): string;
  redactDeep<T>(value: T): T;
}

export function createSecretRedactor(placeholder: string = REDACTED_PLACEHOLDER): SecretRedactor {
  const secrets: string[] = [];
  let pattern: RegExp | null = null;
  const redact = (text: string): string =>
    pattern ? text.replace(pattern, () => placeholder) : text;
  const redactDeep = (value: unknown): unknown => {
    if (secrets.length === 0) {
      return value;
    }
    if (typeof value === "string") {
      return redact(value);
    }
    if (typeof value === "number" && redact(String(value)) !== String(value)) {
      return placeholder;
    }
    if (Array.isArray(value)) {
      return value.map(redactDeep);
    }
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [redact(key), redactDeep(entry)]),
      );
    }
    return value;
  };
  return {
    get secretCount() {
      return secrets.length;
    },
    addSecret(value: string): void {
      if (value.length === 0 || secrets.includes(value)) {
        return;
      }
      secrets.push(value);
      secrets.sort((a, b) => b.length - a.length);
      pattern = new RegExp(
        secrets.map((secret) => secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
        "g",
      );
    },
    redact,
    redactDeep: redactDeep as SecretRedactor["redactDeep"],
  };
}

export interface BrowserSecretSources {
  passwords: readonly string[];
  cookieValues: readonly string[];
  fieldValues: readonly string[];
}

export function createBrowserSecretRedactor(sources: BrowserSecretSources): SecretRedactor {
  const redactor = createSecretRedactor(BROWSER_REDACTED_PLACEHOLDER);
  for (const value of [...sources.passwords, ...sources.fieldValues]) {
    redactor.addSecret(value);
  }
  for (const value of sources.cookieValues) {
    if (value.length >= MIN_COOKIE_SECRET_LENGTH) {
      redactor.addSecret(value);
    }
  }
  return redactor;
}

export function normalizeOrigin(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host.length === 0) {
    return null;
  }
  const defaultPort = parsed.protocol === "http:" ? "80" : "443";
  const port = parsed.port;
  return port.length === 0 || port === defaultPort
    ? `${parsed.protocol}//${host}`
    : `${parsed.protocol}//${host}:${port}`;
}

export function isOriginAllowed(url: string, allowedOrigins: readonly string[]): boolean {
  const origin = normalizeOrigin(url);
  if (!origin) {
    return false;
  }
  for (const allowed of allowedOrigins) {
    if (normalizeOrigin(allowed) === origin) {
      return true;
    }
  }
  return false;
}
