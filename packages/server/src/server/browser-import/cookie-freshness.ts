import type { BrowserImportCookie } from "@getpaseo/protocol/browser-import/rpc-schemas";

interface ProfileCookie {
  domain: string;
  path: string;
  name: string;
  expires: number;
}

const GOOGLE_SIGN_IN_COOKIES = new Set([
  "SID",
  "HSID",
  "SSID",
  "APISID",
  "SAPISID",
  "LSID",
  "__Secure-1PSID",
  "__Secure-3PSID",
  "__Secure-1PSIDTS",
  "__Secure-3PSIDTS",
]);

function cookieKey(cookie: ProfileCookie): string {
  return `${cookie.domain}\t${cookie.path}\t${cookie.name}`;
}

export function selectFresherImportedCookies(input: {
  existing: ProfileCookie[];
  imported: BrowserImportCookie[];
}): BrowserImportCookie[] {
  const existing = new Map(input.existing.map((cookie) => [cookieKey(cookie), cookie]));
  return input.imported.filter((cookie) => {
    const current = existing.get(cookieKey(cookie));
    if (!current) return true;
    return current.expires !== -1 && cookie.expires !== -1 && cookie.expires > current.expires;
  });
}

export function newestGoogleSignInAt(cookies: BrowserImportCookie[]): number | undefined {
  let newest: number | undefined;
  for (const cookie of cookies) {
    if (cookie.updatedAt === undefined || !GOOGLE_SIGN_IN_COOKIES.has(cookie.name)) continue;
    const domain = cookie.domain.replace(/^\./, "");
    if (domain !== "google.com" && !domain.endsWith(".google.com")) continue;
    newest = Math.max(newest ?? cookie.updatedAt, cookie.updatedAt);
  }
  return newest;
}
