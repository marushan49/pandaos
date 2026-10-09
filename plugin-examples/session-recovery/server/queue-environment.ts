import type { PluginSessionOpenRequest } from "@getpaseo/plugin/server";
import { readFile, stat } from "node:fs/promises";
import { z } from "zod";

const absolutePath = z.string().regex(/^\/(?!.*[\n\r:]).+/);
const EnvironmentSchema = z.object({
  JAVA_HOME: absolutePath,
  ANDROID_HOME: absolutePath,
  ANDROID_SDK_ROOT: absolutePath,
  PANDAOS_ANDROID_QUEUE_BIN: absolutePath,
});

export async function readQueueEnvironment(filename = "/etc/pandaos-android-queue/agent-env.json") {
  let contents: string;
  try {
    const metadata = await stat(filename);
    if (!metadata.isFile() || metadata.uid !== 0 || metadata.mode & 0o022)
      throw new Error(
        `${filename}: Android-Queue-Konfiguration muss UID 0 gehören und darf für Gruppe/Andere nicht schreibbar sein.`,
      );
    contents = await readFile(filename, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(
      `${filename}: ${error instanceof Error ? error.message : "Konfiguration nicht lesbar"}`,
      { cause: error },
    );
  }
  try {
    return EnvironmentSchema.parse(JSON.parse(contents));
  } catch (error) {
    throw new Error(
      `${filename}: ungültige Android-Queue-Konfiguration. Repariere die Datei als root.`,
      { cause: error },
    );
  }
}

export async function queueEnvironment(
  request: PluginSessionOpenRequest,
  filename?: string,
): Promise<PluginSessionOpenRequest> {
  const guard = await readQueueEnvironment(filename);
  if (!guard) return request;
  return {
    ...request,
    env: {
      ...request.env,
      ...guard,
      PATH: [
        guard.PANDAOS_ANDROID_QUEUE_BIN,
        `${guard.JAVA_HOME}/bin`,
        request.env.PATH ?? process.env.PATH ?? "/usr/bin:/bin",
      ].join(":"),
    },
  };
}
