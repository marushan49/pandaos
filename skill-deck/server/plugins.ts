import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { z } from "zod";
import { listPlugins, type DeckPlugin } from "../shared/plugins.ts";

const exec = promisify(execFile);
const installedSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    path: z.string(),
    status: z.string(),
    enabled: z.boolean(),
    installation: z
      .object({
        identity: z.object({ kind: z.string() }),
        currentRevision: z.string().optional(),
      })
      .optional(),
  }),
);
const previewSchema = z.array(
  z.object({
    id: z.string(),
    outcome: z.enum(["update", "current", "installed-newer", "local", "error"]),
  }),
);
const messages = {
  unchecked: "Noch nicht geprüft",
  update: "Update verfügbar",
  current: "Aktuell",
  "installed-newer": "Neuer als die angebotene Version",
  local: "Lokales Verzeichnis, kein verwaltetes Update",
  error: "Quelle nicht erreichbar oder Update-Prüfung fehlgeschlagen",
};

export function registerPlugins(server: PluginServerContext) {
  const dataDirectory = server.dataDirectory;
  if (!dataDirectory) throw new Error("Plugin-Datenverzeichnis fehlt. Host aktualisieren.");
  const home = resolve(dataDirectory, "../../..");
  async function cli(args: string[]) {
    try {
      const { stdout } = await exec("pandaos", ["--home", home, "plugin", ...args, "--json"], {
        timeout: 45_000,
        maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, RTK_DISABLED: "1" },
      });
      const value: unknown = JSON.parse(stdout);
      return value;
    } catch {
      throw new Error(
        "PandaOS-CLI auf diesem Host nicht erreichbar. Installation und Verbindung prüfen.",
      );
    }
  }
  server.handle(listPlugins, async ({ checkUpdates }) => {
    const installed = installedSchema.parse(await cli(["ls"]));
    const previews = checkUpdates
      ? previewSchema.parse(await cli(["update", "--all", "--check"]))
      : [];
    return {
      scannedAt: new Date().toISOString(),
      plugins: installed.map((item): DeckPlugin => {
        const update = previews.find((preview) => preview.id === item.id)?.outcome ?? "unchecked";
        return {
          id: item.id,
          name: item.name ?? item.id,
          description: item.description ?? "",
          path: item.path,
          status: item.status,
          enabled: item.enabled,
          source: item.installation?.identity.kind ?? "unknown",
          revision: item.installation?.currentRevision ?? null,
          update,
          message: messages[update],
        };
      }),
    };
  });
}
