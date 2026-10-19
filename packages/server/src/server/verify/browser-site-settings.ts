import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { CDPSession, Download } from "playwright-core";
import {
  BrowserSitePermissionNameSchema,
  BrowserSitePermissionsSchema,
  type BrowserDownload,
  type BrowserSitePermissions,
} from "@getpaseo/protocol/browser-settings/rpc-schemas";
import { writeFileAtomic } from "../atomic-file.js";

export const DEFAULT_SITE_PERMISSIONS: BrowserSitePermissions = {
  defaults: {
    notifications: "block",
    geolocation: "block",
    camera: "block",
    microphone: "block",
    "clipboard-read": "allow",
  },
  sites: [],
};

export function siteOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

export class BrowserSitePermissionStore {
  private cached: Promise<BrowserSitePermissions> | null = null;

  constructor(private readonly file: string) {}

  read(): Promise<BrowserSitePermissions> {
    this.cached ??= readFile(this.file, "utf8").then(
      (text) => BrowserSitePermissionsSchema.parse(JSON.parse(text)),
      () => DEFAULT_SITE_PERMISSIONS,
    );
    return this.cached;
  }

  async write(next: BrowserSitePermissions): Promise<BrowserSitePermissions> {
    const valid = BrowserSitePermissionsSchema.parse({
      defaults: next.defaults,
      sites: next.sites.flatMap((site) => {
        const origin = siteOrigin(site.origin);
        return origin ? [{ ...site, origin }] : [];
      }),
    });
    await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    await writeFileAtomic(this.file, JSON.stringify(valid, null, 2));
    this.cached = Promise.resolve(valid);
    return valid;
  }

  async apply(session: CDPSession, origin: string): Promise<void> {
    const settings = await this.read();
    for (const name of BrowserSitePermissionNameSchema.options) {
      const exception = settings.sites.find(
        (site) => site.origin === origin && site.permission === name,
      );
      const setting = exception?.setting ?? settings.defaults[name];
      await session.send("Browser.setPermission", {
        permission: { name },
        setting: setting === "allow" ? "granted" : "denied",
        origin,
      });
    }
  }
}

function safeFileName(name: string): string {
  const cleaned = path
    .basename(name)
    .replace(/[^\w.\- ()]+/g, "_")
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 180) : "download";
}

export async function saveBrowserDownload(directory: string, download: Download): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const name = `${Date.now()}-${safeFileName(download.suggestedFilename())}`;
  await download.saveAs(path.join(directory, name));
}

export async function listBrowserDownloads(directory: string): Promise<BrowserDownload[]> {
  const names = await readdir(directory).catch(() => [] as string[]);
  const downloads = await Promise.all(
    names.map(async (name) => {
      const match = /^(\d+)-(.+)$/.exec(name);
      if (!match) return null;
      const info = await stat(path.join(directory, name)).catch(() => null);
      if (!info?.isFile()) return null;
      return { name, fileName: match[2], bytes: info.size, savedAt: Number(match[1]) };
    }),
  );
  return downloads
    .filter((download): download is BrowserDownload => download !== null)
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function removeBrowserDownload(directory: string, name: string): Promise<void> {
  if (path.basename(name) !== name) throw new Error("Invalid download name.");
  await rm(path.join(directory, name), { force: true });
}
