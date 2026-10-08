import { describe, expect, it } from "vitest";
import { newestGoogleSignInAt, selectFresherImportedCookies } from "./cookie-freshness.js";

function cookie(
  name: string,
  expires: number,
  extra: { domain?: string; updatedAt?: number } = {},
) {
  return {
    name,
    value: "v",
    domain: extra.domain ?? ".google.com",
    path: "/",
    expires,
    httpOnly: true,
    secure: true,
    ...(extra.updatedAt === undefined ? {} : { updatedAt: extra.updatedAt }),
  };
}

describe("selectFresherImportedCookies", () => {
  it("keeps cookies the browser rotated after the import was taken", () => {
    const written = selectFresherImportedCookies({
      existing: [cookie("__Secure-1PSIDTS", 2_000), cookie("SID", 1_000), cookie("NID", -1)],
      imported: [
        cookie("__Secure-1PSIDTS", 1_500),
        cookie("SID", 1_200),
        cookie("NID", 1_300),
        cookie("LSID", 900, { domain: "accounts.google.com" }),
      ],
    });
    expect(written.map((entry) => entry.name)).toEqual(["SID", "LSID"]);
  });
});

describe("newestGoogleSignInAt", () => {
  it("reports the latest Google sign-in cookie update and ignores other cookies", () => {
    expect(
      newestGoogleSignInAt([
        cookie("SID", 5_000, { updatedAt: 100 }),
        cookie("__Secure-1PSIDTS", 5_000, { updatedAt: 300 }),
        cookie("NID", 5_000, { updatedAt: 900 }),
        cookie("SID", 5_000, { domain: ".example.com", updatedAt: 800 }),
        cookie("LSID", 5_000, { domain: "accounts.google.com", updatedAt: 200 }),
      ]),
    ).toBe(300);
    expect(newestGoogleSignInAt([cookie("SID", 5_000)])).toBeUndefined();
  });
});
