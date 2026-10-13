import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const storeRoot = join(homedir(), ".pandaos", "vision");

export interface VisionPaths {
  workspaceKey: string;
  projectFile: string;
  workspaceFile: string;
}

function keyOf(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

async function projectRootOf(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, "rev-parse", "--git-common-dir"]);
    return dirname(resolve(cwd, stdout.trim()));
  } catch {
    return cwd;
  }
}

export async function visionPaths(cwd: string): Promise<VisionPaths> {
  const projectRoot = await projectRootOf(cwd);
  const workspaceKey = keyOf(cwd);
  return {
    workspaceKey,
    projectFile: join(storeRoot, `project-${keyOf(projectRoot)}.md`),
    workspaceFile: join(storeRoot, `workspace-${workspaceKey}.md`),
  };
}

export async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

export async function writeText(path: string, text: string): Promise<void> {
  await mkdir(storeRoot, { recursive: true });
  await writeFile(path, text, "utf8");
}
