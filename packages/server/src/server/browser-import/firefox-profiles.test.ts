import { describe, expect, it } from "vitest";
import { parseFirefoxProfiles } from "./firefox-profiles.js";

const ROOT = "/Users/me/Library/Application Support/zen";

describe("parseFirefoxProfiles", () => {
  it("reads every profile and its name from profiles.ini", () => {
    const ini = [
      "[General]",
      "StartWithLastProfile=1",
      "Version=2",
      "",
      "[Profile1]",
      "Name=Default Profile",
      "IsRelative=1",
      "Path=Profiles/997jvk3v.Default Profile",
      "",
      "[Profile0]",
      "Name=Default (release)",
      "IsRelative=1",
      "Path=Profiles/9j4dawea.Default (release)",
      "Default=1",
      "",
      "[Profile2]",
      "Name=Elsewhere",
      "IsRelative=0",
      "Path=/Volumes/data/zen-profile",
      "",
      "[Install6ED35B3CA1B1A4DB]",
      "Default=Profiles/9j4dawea.Default (release)",
    ].join("\n");
    expect(parseFirefoxProfiles({ root: ROOT, ini, folders: [] })).toEqual([
      { dir: `${ROOT}/Profiles/997jvk3v.Default Profile`, name: "Default Profile" },
      { dir: `${ROOT}/Profiles/9j4dawea.Default (release)`, name: "Default (release)" },
      { dir: "/Volumes/data/zen-profile", name: "Elsewhere" },
    ]);
  });

  it("falls back to profile folders when profiles.ini is missing or empty", () => {
    const folders = ["Profiles/9j4dawea.Default (release)", "Profile Groups", "Crash Reports"];
    const expected = [
      { dir: `${ROOT}/Profiles/9j4dawea.Default (release)`, name: "Default (release)" },
    ];
    expect(parseFirefoxProfiles({ root: ROOT, ini: null, folders })).toEqual(expected);
    expect(parseFirefoxProfiles({ root: ROOT, ini: "[General]\nVersion=2\n", folders })).toEqual(
      expected,
    );
  });
});
