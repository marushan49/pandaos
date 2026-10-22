import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { parse } from "yaml";
import type { Finding, Skill } from "../shared/contracts";

export interface SkillRoot {
  directory: string;
  scope: "global" | "project";
  providers: string[];
}
const metadataSchema = z.object({
  repository: z.string().optional(),
  commit: z.string().optional(),
  verifiedFiles: z.array(z.string()).optional(),
  files: z.array(z.string()).optional(),
});
const lockSchema = z.object({
  skills: z.record(
    z.string(),
    z.object({
      sourceUrl: z.string().optional(),
      sourceType: z.string().optional(),
      skillPath: z.string().optional(),
    }),
  ),
});
const MAX_BYTES = 512 * 1024;
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function skillRoots(home: string, cwd?: string): SkillRoot[] {
  const roots = (base: string, scope: SkillRoot["scope"]) => [
    { directory: path.join(base, ".agents/skills"), scope, providers: ["codex", "opencode"] },
    { directory: path.join(base, ".claude/skills"), scope, providers: ["claude"] },
    { directory: path.join(base, ".codex/skills"), scope, providers: ["codex"] },
    { directory: path.join(base, ".github/skills"), scope, providers: ["copilot"] },
    { directory: path.join(base, ".opencode/skills"), scope, providers: ["opencode"] },
  ];
  return [
    ...roots(home, "global"),
    {
      directory: path.join(home, ".config/opencode/skills"),
      scope: "global",
      providers: ["opencode"],
    },
    { directory: path.join(home, ".pi/agent/skills"), scope: "global", providers: ["pi"] },
    { directory: path.join(home, ".codex/plugins/cache"), scope: "global", providers: ["codex"] },
    { directory: path.join(home, ".claude/plugins/cache"), scope: "global", providers: ["claude"] },
    ...(cwd ? roots(cwd, "project") : []),
  ];
}

async function jsonFile(file: string): Promise<unknown> {
  try {
    if ((await stat(file)).size > MAX_BYTES) return null;
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

export async function readSkillContent(file: string) {
  const info = await stat(file);
  if (!info.isFile()) throw new Error("SKILL.md ist keine Datei.");
  if (info.size > MAX_BYTES) return { content: null, truncated: true };
  return { content: await readFile(file, "utf8"), truncated: false };
}

export function frontMatter(content: string, key: string): string {
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)?.[1];
  if (!header) return "";
  try {
    const values = z.record(z.string(), z.unknown()).parse(parse(header, { maxAliasCount: 0 }));
    const value = values[key];
    return typeof value === "string" ? value.trim().slice(0, key === "name" ? 200 : 1000) : "";
  } catch {
    return "";
  }
}

async function readSource(
  directory: string,
  fallbackUrl?: string,
  fallbackPath?: string,
): Promise<Skill["source"]> {
  const metadata = metadataSchema
    .catch({})
    .parse(await jsonFile(path.join(directory, "SOURCE.json")));
  const url = metadata.repository ?? fallbackUrl ?? null;
  let kind: Skill["source"]["kind"] = "local";
  if (directory.includes(`${path.sep}plugins${path.sep}cache${path.sep}`)) kind = "unknown";
  if (url) kind = "git";
  const suffix = `${path.basename(directory)}/SKILL.md`;
  const files = [...new Set([...(metadata.verifiedFiles ?? []), ...(metadata.files ?? [])])].filter(
    (file) => file === suffix || file.endsWith(`/${suffix}`),
  );
  const filePath = fallbackPath ?? (files.length === 1 ? files[0] : undefined);
  return {
    kind,
    label: url ?? "Keine belegte Upstream-Quelle",
    url,
    revision: metadata.commit ?? null,
    filePath,
  };
}

export async function scanSkills(roots: SkillRoot[]) {
  const skills = new Map<string, Skill>();
  const warnings: string[] = [];
  for (const root of roots) {
    const lock = lockSchema
      .catch({ skills: {} })
      .parse(await jsonFile(path.join(root.directory, "../.skill-lock.json")));
    let remaining = 5000;
    let depthLimited = false;
    async function add(file: string, broken = false) {
      let canonical: string | null = null;
      let content: string | null = null;
      let health: Skill["health"] = broken ? "broken" : "ok";
      try {
        canonical = await realpath(file);
        content = (await readSkillContent(canonical)).content;
        if (content === null) health = "unreadable";
      } catch {
        health = broken ? "broken" : "unreadable";
      }
      const id = hash(canonical ?? file);
      const existing = skills.get(id);
      if (existing) {
        existing.paths = [...new Set([...existing.paths, file])];
        existing.scopes = [...new Set([...existing.scopes, root.scope])];
        existing.providers = [...new Set([...existing.providers, ...root.providers])];
        return;
      }
      const directory = path.dirname(canonical ?? file);
      const entry = lock.skills[path.basename(path.dirname(file))];
      const source = await readSource(directory, entry?.sourceUrl, entry?.skillPath);
      skills.set(id, {
        id,
        name: frontMatter(content ?? "", "name") || path.basename(path.dirname(file)),
        description: frontMatter(content ?? "", "description"),
        scopes: [root.scope],
        providers: [...root.providers],
        paths: [file],
        realPath: canonical,
        contentHash: content === null ? null : hash(content),
        health,
        source,
        update: {
          status: source.url ? "unchecked" : "unknown",
          checkedAt: null,
          message: source.url ? "Quelle noch nicht geprüft." : "Keine prüfbare Upstream-Quelle.",
        },
        usage: [],
      });
    }
    async function walk(
      directory: string,
      depth: number,
      ancestors = new Set<string>(),
    ): Promise<void> {
      if (depth > 7) {
        depthLimited = true;
        return;
      }
      if (--remaining < 0) return;
      let canonical: string;
      try {
        canonical = await realpath(directory);
      } catch {
        return;
      }
      if (ancestors.has(canonical)) return;
      const visited = new Set([...ancestors, canonical]);
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        warnings.push(
          `Verzeichnis nicht lesbar: ${directory} (${error instanceof Error ? error.message : "Fehler"})`,
        );
        return;
      }
      if (entries.some((entry) => entry.name === "SKILL.md")) {
        const file = path.join(directory, "SKILL.md");
        const info = await lstat(file);
        await add(file, info.isSymbolicLink() && !(await stat(file).catch(() => null)));
        return;
      }
      for (const entry of entries) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        const child = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) {
          const target = await stat(child).catch(() => null);
          if (!target) await add(path.join(child, "SKILL.md"), true);
          else if (target.isDirectory()) await walk(child, depth + 1, visited);
        } else if (entry.isDirectory()) await walk(child, depth + 1, visited);
      }
    }
    await walk(root.directory, 0);
    if (remaining < 0) warnings.push(`Scan-Grenze erreicht: ${root.directory}`);
    if (depthLimited) warnings.push(`Maximale Scantiefe erreicht: ${root.directory}`);
  }
  return { skills: [...skills.values()].sort((a, b) => a.name.localeCompare(b.name)), warnings };
}

export function findIssues(skills: Skill[]): Finding[] {
  const findings: Finding[] = [];
  const names = new Map<string, Skill[]>();
  const contents = new Map<string, Skill[]>();
  for (const skill of skills) {
    if (skill.health !== "ok")
      findings.push({
        id: `health-${skill.id}`,
        kind: skill.health === "broken" ? "broken-link" : "unreadable",
        certainty: "verified",
        title: skill.health === "broken" ? "Kaputter Verweis" : "Inhalt nicht lesbar",
        evidence: skill.paths,
        skillIds: [skill.id],
      });
    names.set(skill.name.toLowerCase(), [...(names.get(skill.name.toLowerCase()) ?? []), skill]);
    if (skill.contentHash)
      contents.set(skill.contentHash, [...(contents.get(skill.contentHash) ?? []), skill]);
  }
  for (const [name, group] of names) {
    if (group.length < 2) continue;
    const different = new Set(group.map((skill) => skill.contentHash)).size > 1;
    findings.push({
      id: `name-${hash(name)}`,
      kind: "name-collision",
      certainty: "verified",
      title: different
        ? `Gleicher Name, abweichender Inhalt: ${group[0]?.name}`
        : `Gleicher Name an mehreren Orten: ${group[0]?.name}`,
      evidence: [
        ...group.flatMap((skill) => skill.paths),
        "Tatsächliche Priorität hängt vom Provider und seiner Konfiguration ab.",
      ],
      skillIds: group.map((skill) => skill.id),
    });
  }
  for (const [digest, group] of contents) {
    if (group.length > 1)
      findings.push({
        id: `content-${digest}`,
        kind: "identical-content",
        certainty: "verified",
        title: "Identischer Inhalt in getrennten Dateien",
        evidence: group.flatMap((skill) => skill.paths),
        skillIds: group.map((skill) => skill.id),
      });
  }
  return [...findings, ...possibleOverlaps(skills)];
}

function possibleOverlaps(skills: Skill[]): Finding[] {
  const findings: Finding[] = [];
  const descriptions = new Map<string, Skill[]>();
  for (const skill of skills) {
    const description = skill.description.trim().toLowerCase();
    if (description.length >= 40)
      descriptions.set(description, [...(descriptions.get(description) ?? []), skill]);
  }
  for (const [description, group] of descriptions) {
    if (group.length > 1 && new Set(group.map((skill) => skill.contentHash)).size > 1)
      findings.push({
        id: `overlap-${hash(description)}`,
        kind: "possible-overlap",
        certainty: "possible",
        title: "Mögliche Überschneidung: gleiche Beschreibung",
        evidence: [
          group[0]?.description ?? "",
          "Gleiche Beschreibung belegt keinen semantischen Konflikt.",
        ],
        skillIds: group.map((skill) => skill.id),
      });
  }
  return findings;
}
