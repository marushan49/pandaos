import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { PluginLifecycleEvents } from "@getpaseo/plugin/server";
import {
  findIssues,
  frontMatter,
  hash,
  readSkillContent,
  scanSkills,
  type SkillRoot,
} from "./inventory";
import { contentUpdate, hashSkillResponse, publicGitSource, rawSkillUrl } from "./updates";
import { createUsage, observedSkillIds } from "./usage";

test("groups canonical files, preserves aliases, reports real collisions and broken links", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "skill-deck-fs-"));
  try {
    const global = path.join(temp, "global");
    const project = path.join(temp, "project");
    await mkdir(path.join(global, "one"), { recursive: true });
    await mkdir(path.join(project, "two"), { recursive: true });
    await writeFile(
      path.join(global, "one/SKILL.md"),
      "---\nname: example\ndescription: A sufficiently long matching description for overlap detection.\n---\nGlobal rules",
    );
    await writeFile(
      path.join(global, "one/SOURCE.json"),
      JSON.stringify({
        repository: "https://github.com/example/skills",
        commit: "a".repeat(40),
        verifiedFiles: ["skills/one/SKILL.md", "skills/other/SKILL.md"],
      }),
    );
    await writeFile(
      path.join(project, "two/SKILL.md"),
      "---\nname: example\ndescription: A sufficiently long matching description for overlap detection.\n---\nDifferent project rules",
    );
    await symlink(path.join(global, "one"), path.join(global, "alias"));
    await symlink(path.join(global, "one"), path.join(project, "shared"));
    await symlink(path.join(temp, "missing"), path.join(global, "broken"));
    await mkdir(path.join(global, "container"));
    await symlink(global, path.join(global, "container/loop"));
    const roots: SkillRoot[] = [
      { directory: global, scope: "global", providers: ["codex"] },
      { directory: project, scope: "project", providers: ["claude"] },
    ];
    const result = await scanSkills(roots);
    assert.equal(result.skills.length, 3);
    const canonical = result.skills.find(
      (skill) =>
        skill.contentHash ===
        hash(
          "---\nname: example\ndescription: A sufficiently long matching description for overlap detection.\n---\nGlobal rules",
        ),
    );
    assert.ok(canonical);
    assert.equal(canonical.paths.length, 3);
    assert.deepEqual(canonical.scopes.sort(), ["global", "project"]);
    assert.deepEqual(canonical.providers.sort(), ["claude", "codex"]);
    assert.equal(canonical.source.kind, "git");
    assert.equal(canonical.source.revision, "a".repeat(40));
    assert.equal(canonical.source.filePath, "skills/one/SKILL.md");
    const issues = findIssues(result.skills);
    assert.ok(
      issues.some((issue) => issue.kind === "broken-link" && issue.certainty === "verified"),
    );
    assert.ok(
      issues.some((issue) => issue.kind === "name-collision" && issue.certainty === "verified"),
    );
    assert.ok(
      issues.some((issue) => issue.kind === "possible-overlap" && issue.certainty === "possible"),
    );
    assert.equal(
      issues.some((issue) => issue.kind === "identical-content"),
      false,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("separate identical copies stay distinct and oversized skill contents are bounded", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "skill-deck-copies-"));
  try {
    for (const name of ["first", "second", "large", "broken-file"])
      await mkdir(path.join(temp, name));
    await writeFile(path.join(temp, "first/SKILL.md"), "---\nname: same\n---\nRules");
    await writeFile(path.join(temp, "second/SKILL.md"), "---\nname: same\n---\nRules");
    await writeFile(path.join(temp, "large/SKILL.md"), "x".repeat(512 * 1024 + 1));
    await symlink(path.join(temp, "absent.md"), path.join(temp, "broken-file/SKILL.md"));
    const result = await scanSkills([{ directory: temp, scope: "global", providers: ["codex"] }]);
    assert.equal(result.skills.length, 4);
    assert.equal(
      findIssues(result.skills).filter((issue) => issue.kind === "identical-content").length,
      1,
    );
    assert.deepEqual(await readSkillContent(path.join(temp, "large/SKILL.md")), {
      content: null,
      truncated: true,
    });
    assert.equal(result.skills.find((skill) => skill.name === "broken-file")?.health, "broken");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("source checks reject credentials, local targets and non-HTTPS transports", () => {
  assert.equal(publicGitSource("https://github.com/example/skills.git"), true);
  for (const url of [
    "file:///etc/passwd",
    "https://127.0.0.1/repo",
    "https://github.com.evil.test/repo",
    "https://token@github.com/repo",
    "git@github.com:example/repo",
    "https://github.com:6767/repo",
    "https://github.com/repo?token=secret",
  ])
    assert.equal(publicGitSource(url), false);
});

test("builds immutable GitHub file URLs only for safe known repository paths", () => {
  const revision = "a".repeat(40);
  assert.equal(
    rawSkillUrl("https://github.com/example/skills.git", revision, "skills/my skill/SKILL.md"),
    `https://raw.githubusercontent.com/example/skills/${revision}/skills/my%20skill/SKILL.md`,
  );
  for (const file of [
    "/SKILL.md",
    "../SKILL.md",
    "skills/../SKILL.md",
    "skills\\other/SKILL.md",
    "skills/%2e%2e/SKILL.md",
    "skills/SKILL.md?secret=x",
    "skills/README.md",
  ])
    assert.equal(rawSkillUrl("https://github.com/example/skills", revision, file), null);
  assert.equal(rawSkillUrl("https://gitlab.com/example/skills", revision, "SKILL.md"), null);
  assert.equal(rawSkillUrl("https://github.com/example/skills", "main", "SKILL.md"), null);
});

test("hashes bounded upstream bytes and reports content changes without installing", async () => {
  const digest = await hashSkillResponse(new Response("Actual skill rules"));
  assert.equal(digest, hash("Actual skill rules"));
  assert.equal(contentUpdate(digest, digest, "now").status, "current");
  const update = contentUpdate(hash("Local adaptation"), digest, "now");
  assert.equal(update.status, "available");
  assert.match(update.message, /lokale Anpassungen/);
  await assert.rejects(hashSkillResponse(new Response("x", { status: 404 })));
  await assert.rejects(hashSkillResponse(new Response("x".repeat(512 * 1024 + 1))));
});

test("reads a lockfile's exact upstream skill path without inventing a revision", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "skill-deck-source-"));
  try {
    const root = path.join(temp, "skills");
    await mkdir(path.join(root, "locked"), { recursive: true });
    await writeFile(path.join(root, "locked/SKILL.md"), "---\nname: locked\n---\nRules");
    await writeFile(
      path.join(temp, ".skill-lock.json"),
      JSON.stringify({
        skills: {
          locked: {
            sourceUrl: "https://github.com/example/skills.git",
            skillPath: "upstream/locked/SKILL.md",
            skillFolderHash: "not-a-git-commit",
          },
        },
      }),
    );
    const result = await scanSkills([{ directory: root, scope: "global", providers: ["codex"] }]);
    assert.equal(result.skills[0]?.source.filePath, "upstream/locked/SKILL.md");
    assert.equal(result.skills[0]?.source.revision, null);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("reads folded YAML descriptions without interpreting malformed frontmatter", () => {
  assert.equal(
    frontMatter(
      '---\nname: "example: skill"\ndescription: >\n  first line\n  second line\n---\nBody',
      "description",
    ),
    "first line second line",
  );
  assert.equal(frontMatter("---\nname: [invalid\n---\nBody", "name"), "");
  assert.equal(frontMatter("---\nname: &a [*a]\n---\nBody", "name"), "");
});

test("usage excludes history and failed reads, counting only observed current-message reads", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "skill-deck-usage-"));
  try {
    const file = path.join(temp, "SKILL.md");
    await writeFile(file, "rules");
    const agent = {
      id: "agent",
      provider: "codex",
      cwd: temp,
      title: null,
      workspaceId: null,
      parentAgentId: null,
    };
    const event: PluginLifecycleEvents["agent.turn_ended"] = {
      agent,
      turnId: "turn",
      outcome: { kind: "completed" },
      timeline: [
        {
          type: "tool_call",
          callId: "historical",
          name: "Read",
          status: "completed",
          error: null,
          detail: { type: "read", filePath: file },
        },
        { type: "user_message", messageId: "current", text: "never persisted" },
        {
          type: "tool_call",
          callId: "failed",
          name: "Read",
          status: "failed",
          error: "failed",
          detail: { type: "read", filePath: file },
        },
        {
          type: "tool_call",
          callId: "read",
          name: "Read",
          status: "completed",
          error: null,
          detail: { type: "read", filePath: "SKILL.md" },
        },
        {
          type: "tool_call",
          callId: "shell",
          name: "Bash",
          status: "completed",
          error: null,
          detail: { type: "shell", command: `echo ${file}` },
        },
      ],
    };
    let scans = 0;
    const getSkills = async () => {
      scans++;
      return [];
    };
    assert.deepEqual(await observedSkillIds(event, "current", getSkills), [
      { callId: "read", skillId: hash(file) },
    ]);
    assert.deepEqual(await observedSkillIds(event, "unobserved-message", getSkills), []);
    const projected: typeof event = {
      ...event,
      timeline: event.timeline.map((item) => {
        if (item.type !== "user_message") return item;
        return {
          type: "tool_call",
          callId: "paseo-agent-message:current",
          name: "agent_message",
          status: "completed",
          error: null,
          detail: { type: "plain_text", text: "agent follow-up", icon: "bot" },
        } satisfies PluginLifecycleEvents["agent.turn_ended"]["timeline"][number];
      }),
    };
    assert.deepEqual(await observedSkillIds(projected, "current", getSkills), [
      { callId: "read", skillId: hash(file) },
    ]);
    assert.deepEqual(await observedSkillIds(projected, "different-message", getSkills), []);
    assert.equal(scans, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("qualified skill calls require provider and canonical plugin-path evidence with a unique match", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "skill-deck-qualified-"));
  try {
    const pluginRoot = path.join(temp, ".codex/plugins/cache/market/ponytail");
    const first = path.join(pluginRoot, "1/skills/review");
    const unrelated = path.join(temp, "global/review");
    for (const directory of [first, unrelated]) {
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, "SKILL.md"), "---\nname: review\n---\nRules");
    }
    const roots: SkillRoot[] = [
      { directory: path.join(temp, ".codex/plugins/cache"), scope: "global", providers: ["codex"] },
      { directory: path.join(temp, "global"), scope: "global", providers: ["codex"] },
    ];
    const { skills } = await scanSkills(roots);
    const canonical = skills.find((skill) => skill.realPath === path.join(first, "SKILL.md"));
    assert.ok(canonical);
    let scans = 0;
    const getSkills = async () => {
      scans++;
      return skills;
    };
    const eventFor = (
      requested: string,
      provider: string,
    ): PluginLifecycleEvents["agent.turn_ended"] => ({
      agent: {
        id: "agent",
        provider,
        cwd: temp,
        title: null,
        workspaceId: null,
        parentAgentId: null,
      },
      turnId: "turn",
      outcome: { kind: "completed" },
      timeline: [
        { type: "user_message", messageId: "current", text: "not stored" },
        {
          type: "tool_call",
          callId: "skill",
          name: "Skill",
          status: "completed",
          error: null,
          detail: { type: "unknown", input: { skill: requested }, output: null },
        },
      ],
    });
    for (const provider of ["codex", "codex-plus", "codex-business"])
      assert.deepEqual(
        await observedSkillIds(eventFor("ponytail:review", provider), "current", getSkills),
        [{ callId: "skill", skillId: canonical.id }],
      );
    assert.deepEqual(
      await observedSkillIds(eventFor("other:review", "codex"), "current", getSkills),
      [],
    );
    assert.deepEqual(
      await observedSkillIds(eventFor("ponytail:review", "claude"), "current", getSkills),
      [],
    );
    assert.deepEqual(await observedSkillIds(eventFor("review", "codex"), "current", getSkills), []);
    assert.deepEqual(
      await observedSkillIds(eventFor("ponytail:review", "codex"), "current", async () => [
        { ...canonical, realPath: path.join(unrelated, "SKILL.md") },
      ]),
      [],
    );
    const second = path.join(pluginRoot, "2/skills/review");
    await mkdir(second, { recursive: true });
    await writeFile(path.join(second, "SKILL.md"), "---\nname: review\n---\nChanged rules");
    const versions = await scanSkills(roots);
    assert.deepEqual(
      await observedSkillIds(
        eventFor("ponytail:review", "codex"),
        "current",
        async () => versions.skills,
      ),
      [],
    );
    assert.equal(scans, 6);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("usage retains the first turn marker and skips empty or deduplicated persistence writes", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "skill-deck-ledger-"));
  const events = new EventEmitter();
  const dataDirectory = path.join(temp, "data");
  const file = path.join(dataDirectory, "usage.json");
  const server: Parameters<typeof createUsage>[0] = {
    dataDirectory,
    supportsLifecycleEvent: () => true,
    on(name, handler) {
      events.on(name, handler);
      return () => {
        events.off(name, handler);
      };
    },
  };
  let scans = 0;
  const usage = createUsage(server, async () => {
    scans++;
    return [];
  });
  try {
    const directory = path.join(temp, "skill");
    await mkdir(directory);
    await writeFile(path.join(directory, "SKILL.md"), "---\nname: example\n---\nRules");
    const { skills } = await scanSkills([{ directory, scope: "global", providers: ["codex"] }]);
    const agent = {
      id: "agent",
      provider: "codex",
      cwd: directory,
      title: null,
      workspaceId: null,
      parentAgentId: null,
    };
    const accept = (messageId: string) =>
      events.emit("agent.user_message_accepted", {
        agent,
        messageId,
        text: "SECRET_MARKER",
        prompt: { text: "SECRET_MARKER" },
        origin: "client",
      });
    const finish = (timeline: PluginLifecycleEvents["agent.turn_ended"]["timeline"]) =>
      events.emit("agent.turn_ended", {
        agent,
        timeline,
        turnId: "turn",
        outcome: { kind: "completed" },
      });
    accept("empty");
    finish([{ type: "user_message", messageId: "empty", text: "SECRET_MARKER" }]);
    await usage.apply(skills);
    await assert.rejects(stat(file), { code: "ENOENT" });
    accept("first");
    accept("mid-turn");
    const read = {
      type: "tool_call",
      callId: "same-read",
      name: "Read",
      status: "completed",
      error: null,
      detail: { type: "read", filePath: "SKILL.md" },
    } satisfies PluginLifecycleEvents["agent.turn_ended"]["timeline"][number];
    finish([
      { type: "user_message", messageId: "first", text: "SECRET_MARKER" },
      read,
      { type: "user_message", messageId: "mid-turn", text: "SECRET_MARKER" },
    ]);
    await usage.apply(skills);
    assert.equal(skills[0]?.usage[0]?.count, 1);
    const saved = await stat(file, { bigint: true });
    const content = await readFile(file, "utf8");
    assert.equal(content.includes("SECRET_MARKER"), false);
    assert.equal(content.includes(directory), false);
    accept("duplicate");
    finish([{ type: "user_message", messageId: "duplicate", text: "SECRET_MARKER" }, read]);
    await usage.apply(skills);
    const unchanged = await stat(file, { bigint: true });
    assert.equal(unchanged.ino, saved.ino);
    assert.equal(unchanged.mtimeNs, saved.mtimeNs);
    assert.equal(skills[0]?.usage[0]?.count, 1);
    assert.equal(scans, 0);
  } finally {
    await usage.close();
    assert.equal(events.eventNames().length, 0);
    await rm(temp, { recursive: true, force: true });
  }
});
