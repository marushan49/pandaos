import path from "node:path";

export interface FirefoxProfile {
  dir: string;
  name: string;
}

const PROFILE_FOLDER = /^[a-z0-9]{8}\.(.+)$/i;

export function parseFirefoxProfiles(input: {
  root: string;
  ini: string | null;
  folders: string[];
}): FirefoxProfile[] {
  const fromIni = input.ini ? parseProfilesIni(input.root, input.ini) : [];
  if (fromIni.length > 0) return fromIni;
  return input.folders.flatMap((folder) => {
    const match = PROFILE_FOLDER.exec(path.basename(folder));
    return match ? [{ dir: path.join(input.root, folder), name: match[1]! }] : [];
  });
}

function parseProfilesIni(root: string, ini: string): FirefoxProfile[] {
  const profiles: FirefoxProfile[] = [];
  for (const section of ini.split(/^\[/m)) {
    if (!section.startsWith("Profile")) continue;
    const fields = Object.fromEntries(
      section
        .split(/\r?\n/)
        .map((line) => line.split("="))
        .filter((parts) => parts.length >= 2)
        .map(([key, ...rest]) => [key!.trim(), rest.join("=").trim()]),
    );
    if (!fields.Path) continue;
    const dir = fields.IsRelative === "0" ? fields.Path : path.join(root, fields.Path);
    profiles.push({ dir, name: fields.Name || fields.Path });
  }
  return profiles;
}
