import type { PaseoAgent, PaseoAgentSendOptions, PaseoApi } from "@getpaseo/client";
import type { PluginHookAgent } from "@getpaseo/plugin/server";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecoveryService } from "./recovery";
import { RecoveryStore } from "./store";

const hook: PluginHookAgent = {
  id: "recovery-test",
  title: "Recovery test",
  cwd: "/project",
  provider: "codex",
  workspaceId: "workspace",
  parentAgentId: null,
};
const directories: string[] = [];

async function storage() {
  const directory = await mkdtemp(join(tmpdir(), "pandaos-recovery-"));
  directories.push(directory);
  return { directory, store: new RecoveryStore(directory) };
}

function agent(overrides: Partial<PaseoAgent> = {}): PaseoAgent {
  return {
    ...hook,
    model: null,
    createdAt: "2026-10-09T10:00:00Z",
    updatedAt: "2026-10-09T10:00:00Z",
    lastUserMessageAt: null,
    status: "idle",
    activeTurn: null,
    capabilities: {
      supportsImages: false,
      supportsMcpServers: false,
      supportsModelSwitch: false,
      supportsThinkingSwitch: false,
    },
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    labels: {},
    ...overrides,
  } as PaseoAgent;
}

function connection(
  snapshot: PaseoAgent,
  send = vi.fn(async (_text: string, _options?: PaseoAgentSendOptions) => {}),
) {
  const handle = {
    refresh: async () => ({ agent: snapshot, project: null }),
    send,
    timeline: {
      refetch: vi.fn(async () => ({
        entries: [],
        error: null,
        gap: false,
        staleCursor: false,
        hasOlder: false,
        startCursor: null,
      })),
    },
  };
  const paseo = {
    agents: {
      list: async () => ({
        entries: [{ agent: snapshot }],
        pageInfo: { hasMore: false, nextCursor: null },
        subscription: { subscribe: () => () => {}, release: async () => {} },
      }),
      ref: () => handle,
    },
  } as unknown as PaseoApi;
  return { paseo, send, handle };
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("session recovery", () => {
  it("persists an unfinished turn across a daemon crash and exposes manual continuation", async () => {
    const { directory, store } = await storage();
    await new RecoveryService(store, "boot-one").started(hook, "turn-one");
    const service = new RecoveryService(new RecoveryStore(directory), "boot-two");
    const { paseo, send } = connection(agent());
    const result = await service.list(paseo);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].canResume).toBe(true);
    expect(send).not.toHaveBeenCalled();
    const record = result.candidates[0];
    await Promise.all([
      service.resume(record.agentId, record.revision, paseo),
      service.resume(record.agentId, record.revision, paseo),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toEqual({
      messageId: expect.any(String),
      activeTurnBehavior: "steer",
    });
    expect((await service.list(paseo)).candidates).toEqual([]);
    expect((await stat(join(directory, "turns.json"))).mode & 0o777).toBe(0o600);
    expect(await readFile(join(directory, "turns.json"), "utf8")).not.toContain(
      "Arbeite am bestehenden Ziel",
    );
  });

  it.each(["completed", "canceled", "archived"])(
    "excludes a %s turn after restart",
    async (kind) => {
      const { directory, store } = await storage();
      const original = new RecoveryService(store, "boot-one");
      await original.started(hook, "turn-one");
      if (kind === "archived") await original.archived(hook.id);
      else
        await original.ended(
          hook,
          "turn-one",
          kind === "completed" ? { kind } : { kind: "canceled", reason: "interrupted" },
        );
      expect(
        (
          await new RecoveryService(new RecoveryStore(directory), "boot-two").list(
            connection(agent()).paseo,
          )
        ).candidates,
      ).toEqual([]);
    },
  );

  it("does not call an ordinary idle session or same-daemon plugin reload a crash", async () => {
    const { directory, store } = await storage();
    const first = new RecoveryService(store, "boot-one");
    expect((await first.list(connection(agent()).paseo)).candidates).toEqual([]);
    await first.started(hook, null);
    expect(
      (
        await new RecoveryService(new RecoveryStore(directory), "boot-one").list(
          connection(agent()).paseo,
        )
      ).candidates,
    ).toEqual([]);
  });

  it("keeps a stable resume message ID after a lost acknowledgement and plugin reload", async () => {
    const { directory, store } = await storage();
    const service = new RecoveryService(store, "boot-one");
    await service.ended(hook, "turn-one", {
      kind: "failed",
      error: { message: "provider exited" },
    });
    const record = (await store.all())[0];
    const first = connection(
      agent(),
      vi.fn(async (_text: string, _options?: PaseoAgentSendOptions) => {
        throw new Error("connection lost");
      }),
    );
    await expect(service.resume(record.agentId, record.revision, first.paseo)).rejects.toThrow(
      "connection lost",
    );
    const retry = connection(agent());
    await new RecoveryService(new RecoveryStore(directory), "boot-one").resume(
      record.agentId,
      record.revision,
      retry.paseo,
    );
    expect(first.send.mock.calls[0][1]).toEqual(retry.send.mock.calls[0][1]);
  });

  it("does not resend a continuation already recorded after a lost acknowledgement", async () => {
    const { directory, store } = await storage();
    const service = new RecoveryService(store, "boot-one");
    await service.ended(hook, null, { kind: "failed", error: { message: "provider exited" } });
    const record = (await store.all())[0];
    const first = connection(
      agent(),
      vi.fn(async () => {
        throw new Error("lost acknowledgement");
      }),
    );
    await expect(service.resume(record.agentId, record.revision, first.paseo)).rejects.toThrow();
    const messageId = (await store.all())[0].resumeMessageId!;
    const retry = connection(agent());
    retry.handle.timeline.refetch.mockResolvedValue({
      entries: [{ item: { type: "user_message", clientMessageId: messageId } }] as never,
      error: null,
      gap: false,
      staleCursor: false,
      hasOlder: false,
      startCursor: null,
    });
    await new RecoveryService(new RecoveryStore(directory), "boot-one").resume(
      record.agentId,
      record.revision,
      retry.paseo,
    );
    expect(retry.send).not.toHaveBeenCalled();
    expect((await new RecoveryStore(directory).all())[0].phase).toBe("resolved");
  });

  it("refuses to resume a session that has started work again", async () => {
    const { store } = await storage();
    const service = new RecoveryService(store, "boot-one");
    await service.ended(hook, null, { kind: "failed", error: { message: "failed" } });
    const record = (await store.all())[0];
    const { paseo, send } = connection(
      agent({ status: "running", activeTurn: { turnId: "new", startedAt: null } }),
    );
    await expect(service.resume(record.agentId, record.revision, paseo)).rejects.toThrow(
      "arbeitet bereits",
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("ignores a late completion for an older turn", async () => {
    const { store } = await storage();
    const service = new RecoveryService(store, "boot-one");
    await service.started(hook, "new");
    await service.ended(hook, "old", { kind: "completed" });
    expect((await store.all())[0]).toMatchObject({ phase: "running", turnId: "new" });
  });

  it("tracks accepted requests without a started event across a crash", async () => {
    const { directory, store } = await storage();
    await new RecoveryService(store, "boot-one").accepted(hook, "message-one");
    expect(
      (
        await new RecoveryService(new RecoveryStore(directory), "boot-two").list(
          connection(agent()).paseo,
        )
      ).candidates[0],
    ).toMatchObject({ messageId: "message-one", phase: "interrupted" });
  });

  it("enrolls existing running work and leaves imported errors dismissed", async () => {
    const { store } = await storage();
    const service = new RecoveryService(store, "boot-one");
    await service.list(connection(agent({ status: "running" })).paseo);
    expect((await store.all())[0].phase).toBe("running");
    const { store: errors } = await storage();
    const recovery = new RecoveryService(errors, "boot-one");
    const errorConnection = connection(agent({ status: "error", lastError: "provider failed" }));
    const record = (await recovery.list(errorConnection.paseo)).candidates[0];
    await recovery.dismiss(record.agentId, record.revision);
    expect((await recovery.list(errorConnection.paseo)).candidates).toEqual([]);
  });

  it("reports corrupted storage rather than dropping recovery evidence", async () => {
    const { directory, store } = await storage();
    await store.flush();
    await writeFile(join(directory, "turns.json"), "invalid-json");
    await expect(new RecoveryStore(directory).all()).rejects.toThrow();
  });
});
