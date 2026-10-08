import { describe, expect, test } from "vitest";

import { resolveCreateAgentTitles } from "./agent/create-agent-title.js";

describe("resolveCreateAgentTitles", () => {
  test("derives a provisional title from prompt when explicit title is absent", () => {
    const resolved = resolveCreateAgentTitles({
      configTitle: undefined,
      initialPrompt: "Implement auth retries with backoff\n\ninclude tests",
    });

    expect(resolved.explicitTitle).toBeNull();
    expect(resolved.provisionalTitle).toBe("Implement auth retries with backoff");
  });

  test("preserves explicit title and does not treat it as provisional", () => {
    const resolved = resolveCreateAgentTitles({
      configTitle: "  Keep This Title  ",
      initialPrompt: "Ignored prompt title",
    });

    expect(resolved.explicitTitle).toBe("Keep This Title");
    expect(resolved.provisionalTitle).toBe("Keep This Title");
  });

  test("returns null values when prompt and title are empty", () => {
    const resolved = resolveCreateAgentTitles({
      configTitle: "   ",
      initialPrompt: "   ",
    });

    expect(resolved.explicitTitle).toBeNull();
    expect(resolved.provisionalTitle).toBeNull();
  });
});

import { afterEach, beforeEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentManager } from "./agent/agent-manager.js";
import { AgentStorage } from "./agent/agent-storage.js";
import { MockLoadTestAgentClient } from "./agent/providers/mock-load-test-agent.js";
import {
  ContextualTitles,
  canGenerateContextualTitle,
  createJevTitleCheck,
} from "./contextual-titles.js";
import {
  FileBackedWorkspaceRegistry,
  createPersistedWorkspaceRecord,
} from "./workspace-registry.js";
import { createTestLogger } from "../test-utils/test-logger.js";

describe("Accepted prompt contextual titles", () => {
  let directory: string;
  let manager: AgentManager;
  let storage: AgentStorage;
  let workspaces: FileBackedWorkspaceRegistry;
  let titles: ContextualTitles | undefined;
  const logger = createTestLogger();
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "pandaos-contextual-titles-"));
    storage = new AgentStorage(join(directory, "agents"), logger);
    workspaces = new FileBackedWorkspaceRegistry(join(directory, "workspaces.json"), logger);
    manager = new AgentManager({
      clients: { mock: new MockLoadTestAgentClient(logger) },
      registry: storage,
      logger,
      paseoToolsEnabled: false,
    });
    await workspaces.upsert(
      createPersistedWorkspaceRecord({
        workspaceId: "workspace-fixture",
        projectId: "project-fixture",
        cwd: directory,
        kind: "directory",
        displayName: "Fixture",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );
  });
  afterEach(async () => {
    await titles?.dispose();
    await storage.flush();
    await rm(directory, { recursive: true, force: true });
  });
  async function create(title?: string) {
    return manager.createAgent(
      {
        provider: "mock",
        cwd: directory,
        title,
        featureValues: { mockAssistantResponse: "Fixture response" },
      },
      undefined,
      { workspaceId: "workspace-fixture" },
    );
  }
  async function send(agentId: string, prompt: string) {
    for await (const event of manager.streamAgent(agentId, prompt, {
      clientMessageId: crypto.randomUUID(),
    })) {
      void event;
    }
    await storage.flush();
  }
  function observe(
    generate = vi.fn(
      async (_input: { prompt: string; currentTitle: string | null }) =>
        ({
          title: "Repair login token refresh",
          branch: "repair-login-token-refresh",
        }) as { title: string | null; branch: string | null },
    ),
    titleStillFits?: () => Promise<boolean>,
  ) {
    titles = new ContextualTitles({
      agentManager: manager,
      agentStorage: storage,
      workspaceRegistry: workspaces,
      generate,
      titleStillFits,
      emitWorkspaceUpdate: async () => {},
      onError: (error) => {
        throw error;
      },
    });
    return generate;
  }
  test("leaves greetings unnamed, uses the third actual prompt and persists stable meaningful titles", async () => {
    const generate = observe();
    const agent = await create();
    await send(agent.id, "hi");
    await send(agent.id, "welche skills kannst du nutzen?");
    expect(generate).not.toHaveBeenCalled();
    expect((await storage.get(agent.id))?.title).toBeNull();
    await send(agent.id, "Repair login token refresh with regression tests");
    await vi.waitFor(async () =>
      expect((await storage.get(agent.id))?.titleSource).toBe("generated"),
    );
    expect(generate.mock.calls[0][0].prompt).toContain("welche skills");
    expect(generate.mock.calls[0][0].prompt).toContain("Repair login token refresh");
    await vi.waitFor(async () =>
      expect((await workspaces.get("workspace-fixture"))?.title).toBe("Repair login token refresh"),
    );
    await send(agent.id, "Also add a timeout test");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(
      (await new AgentStorage(join(directory, "agents"), logger).get(agent.id))?.titleSource,
    ).toBe("generated");
  });
  test("observes actual provider user echoes when older callers omit a message ID", async () => {
    const generate = observe();
    const agent = await create();
    for await (const event of manager.streamAgent(agent.id, "Repair login token refresh")) {
      void event;
    }
    await vi.waitFor(async () =>
      expect((await storage.get(agent.id))?.titleSource).toBe("generated"),
    );
    expect(generate).toHaveBeenCalledTimes(1);
  });

  test("upgrades only legacy names matching the actual first message and preserves custom names", async () => {
    const generate = observe();
    const agent = await create();
    await send(agent.id, "hi");
    const legacy = (await storage.get(agent.id))!;
    await storage.upsert({ ...legacy, title: "hi", titleSource: undefined });
    expect(
      canGenerateContextualTitle({ ...legacy, title: "Unrelated custom title" }, "hi", 1),
    ).toBe(false);
    await send(agent.id, "Repair login token refresh");
    await vi.waitFor(async () =>
      expect((await storage.get(agent.id))?.titleSource).toBe("generated"),
    );
    expect(generate).toHaveBeenCalledTimes(1);
  });

  test("treats a creator title as a suggestion and preserves manual same-text renames", async () => {
    const suggested = await create("Reviewer: login fix");
    expect((await storage.get(suggested.id))?.titleSource).toBe("generated");
    const generate = observe();
    await send(suggested.id, "Repair login token refresh");
    await vi.waitFor(async () =>
      expect((await storage.get(suggested.id))?.title).toBe("Repair login token refresh"),
    );
    expect(generate.mock.calls[0][0].currentTitle).toBe("Reviewer: login fix");
    generate.mockClear();
    const unnamed = await create();
    await manager.setTitle(unnamed.id, "Repair login token refresh");
    await send(unnamed.id, "Repair login token refresh");
    expect(generate).not.toHaveBeenCalled();
    expect((await storage.get(unnamed.id))?.titleSource).toBe("manual");
  });
  test("rejects a delayed generated title after an actual manual rename and preserves manually named workspace", async () => {
    let release!: (value: { title: string; branch: string }) => void;
    const generate = vi.fn(
      () =>
        new Promise<{ title: string; branch: string }>((resolve) => {
          release = resolve;
        }),
    );
    observe(generate);
    const agent = await create();
    await send(agent.id, "Fix login bug");
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    await manager.setTitle(agent.id, "Hand picked mission");
    const apply = vi.spyOn(storage, "applyContextualTitle");
    release({ title: "Late generated title", branch: "late-title" });
    await vi.waitFor(() =>
      expect(apply).toHaveBeenCalledWith(agent.id, "Late generated title", null, "generated", 1),
    );
    await titles!.dispose();
    expect((await storage.get(agent.id))?.title).toBe("Hand picked mission");
    expect((await storage.get(agent.id))?.titleSource).toBe("manual");
    await workspaces.update("workspace-fixture", (current) => ({
      ...current,
      title: "Fix login bug",
      titleSource: "manual",
    }));
    const another = await create();
    observe();
    await send(another.id, "Fix login bug");
    await vi.waitFor(async () =>
      expect((await storage.get(another.id))?.titleSource).toBe("generated"),
    );
    expect((await workspaces.get("workspace-fixture"))?.title).toBe("Fix login bug");
  });

  test("renames after the 1st, 4th and 10th prompt from the last six messages, then rests", async () => {
    const generate = observe(
      vi.fn(async ({ prompt }: { prompt: string; currentTitle: string | null }) => ({
        title: `Topic ${prompt.split("\n\n").at(-1)}`,
        branch: "topic",
      })),
    );
    const agent = await create();
    for (let index = 1; index <= 12; index += 1) {
      await send(agent.id, `step ${index} of the login refactor`);
      await titles!.dispose().then(() => observe(generate));
    }
    expect(generate).toHaveBeenCalledTimes(3);
    const [first, fourth, tenth] = generate.mock.calls.map((call) => call[0]);
    expect(first.currentTitle).toBeNull();
    expect(fourth.currentTitle).toBe("Topic step 1 of the login refactor");
    expect(fourth.prompt.split("\n\n")).toHaveLength(4);
    expect(tenth.prompt.split("\n\n")).toEqual(
      [5, 6, 7, 8, 9, 10].map((index) => `step ${index} of the login refactor`),
    );
    const record = await storage.get(agent.id);
    expect(record?.title).toBe("Topic step 10 of the login refactor");
    expect(record?.titleMilestone).toBe(10);
    expect((await workspaces.get("workspace-fixture"))?.title).toBe(record?.title);
  });

  test("keeps the title when the generator or Jev says the topic is unchanged", async () => {
    const agent = await create("Repair login token refresh");
    const generate = observe(
      vi.fn(async ({ currentTitle }: { prompt: string; currentTitle: string | null }) => ({
        title: currentTitle,
        branch: "same",
      })),
    );
    await send(agent.id, "Repair login token refresh");
    await vi.waitFor(async () => expect((await storage.get(agent.id))?.titleMilestone).toBe(1));
    expect(generate).toHaveBeenCalledTimes(1);
    expect((await workspaces.get("workspace-fixture"))?.title).toBeNull();
    await titles!.dispose();
    const stillFits = vi.fn(async () => true);
    observe(generate, stillFits);
    for (const prompt of ["add a test", "fix the lint", "update the docs"])
      await send(agent.id, prompt);
    await vi.waitFor(async () => expect((await storage.get(agent.id))?.titleMilestone).toBe(4));
    expect(stillFits).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(1);
    expect((await storage.get(agent.id))?.title).toBe("Repair login token refresh");
  });

  test("an empty rename makes the title automatic again and regenerates it", async () => {
    const generate = observe();
    const agent = await create();
    await send(agent.id, "Repair login token refresh");
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    await manager.setTitle(agent.id, "My own name");
    await send(agent.id, "now something else");
    expect((await storage.get(agent.id))?.titleSource).toBe("manual");
    await manager.resetTitle(agent.id);
    await vi.waitFor(async () =>
      expect((await storage.get(agent.id))?.title).toBe("Repair login token refresh"),
    );
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].currentTitle).toBeNull();
    expect((await storage.get(agent.id))?.titleSource).toBe("generated");
  });

  test("a workspace follows a suggested or generated agent title but keeps a manual one", async () => {
    await workspaces.update("workspace-fixture", (current) => ({
      ...current,
      title: "Creator workspace name",
      titleSource: "provisional",
    }));
    observe();
    const agent = await create();
    await send(agent.id, "Repair login token refresh");
    await vi.waitFor(async () =>
      expect((await workspaces.get("workspace-fixture"))?.title).toBe("Repair login token refresh"),
    );
    await manager.setTitle(agent.id, "Hand named");
    await workspaces.update("workspace-fixture", (current) => ({
      ...current,
      title: "Mine",
      titleSource: "manual",
    }));
    await manager.resetTitle(agent.id);
    await vi.waitFor(async () =>
      expect((await storage.get(agent.id))?.title).toBe("Repair login token refresh"),
    );
    expect((await workspaces.get("workspace-fixture"))?.title).toBe("Mine");
  });
});

describe("Jev title check", () => {
  const input = {
    agent: { cwd: "/tmp" } as Parameters<ReturnType<typeof createJevTitleCheck>>[0]["agent"],
    title: "Repair login",
    messages: ["fix the login token"],
  };
  const answer = (choice: string, confidence: number) => ({
    answers: {
      topic: {
        choice,
        confidence,
        probabilities:
          choice === "same"
            ? { same: confidence, changed: 1 - confidence }
            : { same: 1 - confidence, changed: confidence },
      },
    },
    model: "jev",
    latencyMs: 1,
  });
  test("skips generation only for a confident same-topic answer and falls through on errors", async () => {
    const decide = vi.fn();
    const check = createJevTitleCheck(
      () => ({ decide }),
      () => 0.6,
    );
    decide.mockResolvedValueOnce(answer("same", 0.9));
    await expect(check(input)).resolves.toBe(true);
    decide.mockResolvedValueOnce(answer("same", 0.55));
    await expect(check(input)).resolves.toBe(false);
    decide.mockResolvedValueOnce(answer("changed", 0.9));
    await expect(check(input)).resolves.toBe(false);
    decide.mockRejectedValueOnce(new Error("System One is disabled"));
    await expect(check(input)).resolves.toBe(false);
  });
});
