import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import { createHash } from "node:crypto";
import type { Skill } from "../shared/contracts";

const exec = promisify(execFile);
export function publicGitSource(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      ["github.com", "gitlab.com", "bitbucket.org"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function rawSkillUrl(source: string, revision: string, filePath: string): string | null {
  if (!publicGitSource(source) || !/^[a-f0-9]{40,64}$/.test(revision)) return null;
  const url = new URL(source);
  const repo = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url.pathname);
  const segments = filePath.split("/");
  if (
    url.hostname !== "github.com" ||
    !repo ||
    !segments.every(
      (segment) =>
        segment !== "." && segment !== ".." && /^[\p{L}\p{N}\p{M}_. @()+-]+$/u.test(segment),
    ) ||
    segments.at(-1) !== "SKILL.md"
  )
    return null;
  return `https://raw.githubusercontent.com/${repo[1]}/${repo[2]}/${revision}/${segments.map(encodeURIComponent).join("/")}`;
}

export async function hashSkillResponse(response: Response): Promise<string> {
  const maxBytes = 512 * 1024;
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw new Error("Upstream-Inhalt nicht lesbar oder zu groß.");
  }
  const digest = createHash("sha256");
  const reader = response.body.getReader();
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return digest.digest("hex");
      size += chunk.value.byteLength;
      if (size > maxBytes) throw new Error("Upstream-Inhalt zu groß.");
      digest.update(chunk.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

export function contentUpdate(
  localHash: string,
  remoteHash: string,
  checkedAt: string,
): Skill["update"] {
  return localHash === remoteHash
    ? {
        status: "current",
        checkedAt,
        message: "Installierter Skill-Inhalt entspricht dem aktuellen Upstream.",
      }
    : {
        status: "available",
        checkedAt,
        message: "Upstream-Inhalt weicht ab; lokale Anpassungen vor Übernahme vergleichen.",
      };
}

async function fetchSkillHash(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "error",
      credentials: "omit",
    });
    return await hashSkillResponse(response);
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkSkillUpdates(skills: Skill[]) {
  const revisions = new Map<string, Promise<string>>();
  const contents = new Map<string, Promise<string>>();
  for (const skill of skills) {
    const url = skill.source.url;
    const checkedAt = new Date().toISOString();
    if (!url || !publicGitSource(url)) {
      skill.update = {
        status: "unknown",
        checkedAt,
        message: url
          ? "Nur öffentliche HTTPS-Quellen von GitHub, GitLab und Bitbucket werden geprüft."
          : "Lokale Quelle ohne prüfbaren Upstream.",
      };
      continue;
    }
    let request = revisions.get(url);
    if (!request) {
      request = exec(
        "git",
        [
          "-c",
          "credential.helper=",
          "-c",
          "core.askPass=",
          "-c",
          "protocol.allow=never",
          "-c",
          "protocol.https.allow=always",
          "-c",
          "http.followRedirects=false",
          "ls-remote",
          "--",
          url,
          "HEAD",
        ],
        {
          cwd: os.tmpdir(),
          timeout: 8000,
          maxBuffer: 65536,
          env: {
            PATH: process.env.PATH,
            LANG: "C",
            GIT_TERMINAL_PROMPT: "0",
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_CONFIG_GLOBAL: "/dev/null",
            RTK_DISABLED: "1",
          },
        },
      ).then(({ stdout }) => {
        const revision = /^([a-f0-9]{40,64})\s+HEAD\s*$/m.exec(stdout)?.[1];
        if (!revision) throw new Error("Kein Repository-HEAD gemeldet.");
        return revision;
      });
      revisions.set(url, request);
    }
    try {
      const latest = await request;
      const fileUrl = skill.source.filePath
        ? rawSkillUrl(url, latest, skill.source.filePath)
        : null;
      if (fileUrl && skill.contentHash) {
        let content = contents.get(fileUrl);
        if (!content) {
          content = fetchSkillHash(fileUrl);
          contents.set(fileUrl, content);
        }
        skill.update = contentUpdate(skill.contentHash, await content, checkedAt);
      } else {
        skill.update = {
          status: "unknown",
          checkedAt,
          message: `Quelle erreichbar, HEAD ${latest.slice(0, 12)}. Kein sicher zugeordneter GitHub-Dateipfad für einen Inhaltsvergleich.`,
        };
      }
    } catch {
      skill.update = {
        status: "error",
        checkedAt,
        message: "Quelle oder Skill-Inhalt nicht erreichbar, ungültig oder größer als 512 KiB.",
      };
    }
  }
}
