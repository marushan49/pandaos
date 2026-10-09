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
      append: vi.fn(async (_item: unknown) => ({ seq: 1, epoch: "timeline" })),
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

  it("keeps new failures manual until automatic recovery is enabled", async () => {
    const { store } = await storage();
    const service = new RecoveryService(store, "boot-one", {
      autoSchedule: false,
      automaticDelayMs: 0,
    });
    const { paseo, send } = connection(agent());
    await service.ended(hook, null, { kind: "failed", error: { message: "provider exited" } });
    await service.runAutomatic(paseo);
    expect(send).not.toHaveBeenCalled();
    expect((await store.state()).history).toEqual([]);
    await service.close();
  });

  it("automatically continues new failures and writes durable history and chat markers", async () => {
    const { directory, store } = await storage();
    const service = new RecoveryService(store, "boot-one", {
      autoSchedule: false,
      automaticDelayMs: 0,
    });
    const { paseo, send, handle } = connection(agent());
    await service.configureAutomatic(true, paseo);
    await service.ended(hook, null, { kind: "failed", error: { message: "provider SIGKILL" } });
    await service.runAutomatic(paseo);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toContain("Automatische Fortsetzung durch Session Recovery am");
    expect(send.mock.calls[0][0]).toContain("Grund: provider SIGKILL");
    expect(handle.timeline.append.mock.calls.map((call) => call[0])).toEqual([
      expect.objectContaining({
        kind: "recovery-event",
        data: expect.objectContaining({ status: "resumed" }),
      }),
    ]);
    const restored = await new RecoveryStore(directory).state();
    expect(restored).toMatchObject({
      enabled: true,
      history: [{ mode: "automatic", status: "resumed", reason: "provider SIGKILL" }],
    });
    await service.close();
  });

  it("does not automatically continue historical imported errors or blocked sessions", async () => {
    const { store } = await storage();
    const service = new RecoveryService(store, "boot-one", {
      autoSchedule: false,
      automaticDelayMs: 0,
    });
    const { paseo, send } = connection(
      agent({ status: "error", lastError: "old error", pendingPermissions: [{} as never] }),
    );
    await service.configureAutomatic(true, paseo);
    await service.runAutomatic(paseo);
    expect(send).not.toHaveBeenCalled();
    expect((await store.all())[0].autoEligible).toBe(false);
    await service.ended(hook, null, { kind: "failed", error: { message: "new error" } });
    await service.runAutomatic(paseo);
    expect(send).not.toHaveBeenCalled();
    expect((await service.list(paseo)).candidates[0].blockedReason).toContain("Freigabe");
    await service.close();
  });

  it("limits a recurring provider crash to three automatic continuations", async () => {
    const { store } = await storage();
    const service = new RecoveryService(store, "boot-one", {
      autoSchedule: false,
      automaticDelayMs: 0,
    });
    let turn = 0;
    const send = vi.fn(async (_text: string, options?: PaseoAgentSendOptions) => {
      await service.accepted(hook, options!.messageId!);
      await service.started(hook, `auto-${++turn}`);
    });
    const { paseo } = connection(agent(), send);
    await service.configureAutomatic(true, paseo);
    await service.ended(hook, null, { kind: "failed", error: { message: "crash" } });
    for (let index = 0; index < 4; index++) {
      await service.runAutomatic(paseo);
      await service.ended(hook, `auto-${turn}`, { kind: "failed", error: { message: "crash" } });
    }
    expect(send).toHaveBeenCalledTimes(3);
    expect((await store.all())[0].autoAttempts).toBe(3);
    expect((await store.state()).history).toHaveLength(3);
    await service.close();
  });

  it("preserves attempt budget when acknowledgement precedes the started hook", async () => {
    const { store } = await storage();
    const service = new RecoveryService(store, "boot-one", {
      autoSchedule: false,
      automaticDelayMs: 0,
    });
    const { paseo, send } = connection(agent());
    await service.configureAutomatic(true, paseo);
    await service.ended(hook, null, { kind: "failed", error: { message: "crash" } });
    await service.runAutomatic(paseo);
    await service.accepted(hook, send.mock.calls[0][1]!.messageId!);
    await service.started(hook, "late-start");
    expect((await store.all())[0].autoAttempts).toBe(1);
    await service.close();
  });

  it("recovers unfinished daemon checkpoints automatically after reconnect", async () => {
    const { directory, store } = await storage();
    await new RecoveryService(store, "old-boot").started(hook, "unfinished");
    await store.setAutomatic(true);
    const service = new RecoveryService(new RecoveryStore(directory), "new-boot", {
      autoSchedule: false,
      automaticDelayMs: 0,
    });
    const { paseo, send } = connection(agent());
    await service.runAutomatic(paseo);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await service.store.state()).history[0]).toMatchObject({
      mode: "automatic",
      status: "resumed",
    });
    await service.close();
  });

  it("respects disabling automation between the durable marker and submission", async () => {
    const { store } = await storage();
    const service = new RecoveryService(store, "boot-one", {
      autoSchedule: false,
      automaticDelayMs: 0,
    });
    const { paseo, send } = connection(agent());
    await service.configureAutomatic(true, paseo);
    await service.ended(hook, null, { kind: "failed", error: { message: "crash" } });
    let entered!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const originalEvent = store.event.bind(store);
    vi.spyOn(store, "event").mockImplementationOnce(async (event) => {
      await originalEvent(event);
      entered();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const operation = service.runAutomatic(paseo);
      await ready;
      await service.configureAutomatic(false, paseo);
      release();
      await operation;
      expect(send).not.toHaveBeenCalled();
      expect((await store.state()).history[0].status).toBe("failed");
    } finally {
      quiet.mockRestore();
      await service.close();
    }
  });

  it("does not continue a session stopped during the durable submission checkpoint", async () => {
    const { store } = await storage();
    const service = new RecoveryService(store, "boot-one", {
      autoSchedule: false,
      automaticDelayMs: 0,
    });
    const { paseo, send } = connection(agent());
    await service.configureAutomatic(true, paseo);
    await service.ended(hook, null, { kind: "failed", error: { message: "crash" } });
    const originalEvent = store.event.bind(store);
    vi.spyOn(store, "event").mockImplementationOnce(async (event) => {
      await originalEvent(event);
      await service.ended(hook, null, { kind: "canceled", reason: "user stop" });
    });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await service.runAutomatic(paseo);
      expect(send).not.toHaveBeenCalled();
      expect((await store.all())[0]).toMatchObject({ phase: "resolved", autoEligible: false });
    } finally {
      quiet.mockRestore();
      await service.close();
    }
  });

  it("keeps explicitly closed sessions manual", async () => {
    const { store } = await storage();
    const service = new RecoveryService(store, "boot-one", {
      autoSchedule: false,
      automaticDelayMs: 0,
    });
    const { paseo, send } = connection(agent());
    await service.configureAutomatic(true, paseo);
    await service.started(hook, "closed-turn");
    await service.closed(hook);
    await service.runAutomatic(paseo);
    expect(send).not.toHaveBeenCalled();
    expect((await service.list(paseo)).candidates[0].autoEligible).toBe(false);
    await service.close();
  });

  it("blocks another automatic turn before the previous provider starts", async () => {
    const { store } = await storage();
    const service = new RecoveryService(store, "boot-one", {
      autoSchedule: false,
      automaticDelayMs: 0,
    });
    const snapshot = agent();
    const { paseo, send } = connection(snapshot);
    await service.configureAutomatic(true, paseo);
    await service.ended(hook, null, { kind: "failed", error: { message: "first crash" } });
    await service.runAutomatic(paseo);
    const second = { ...hook, id: "second" };
    await service.ended(second, null, { kind: "failed", error: { message: "second crash" } });
    await service.runAutomatic(paseo);
    expect(send).toHaveBeenCalledTimes(1);
    await service.close();
  });

  it.each([
    "quota_exceeded",
    "rate_limit_exceeded",
    "authentication_error",
    "context_length_exceeded",
  ])("keeps a %s failure manual", async (code) => {
    const { store } = await storage();
    const service = new RecoveryService(store, "boot-one", {
      autoSchedule: false,
      automaticDelayMs: 0,
    });
    const { paseo, send } = connection(agent());
    await service.configureAutomatic(true, paseo);
    await service.ended(hook, null, {
      kind: "failed",
      error: { code, message: "provider rejected request" },
    });
    await service.runAutomatic(paseo);
    expect(send).not.toHaveBeenCalled();
    expect((await service.list(paseo)).candidates[0].autoEligible).toBe(false);
    await service.close();
  });

  it("preserves old version-one ledgers with opt-in defaults", async () => {
    const { directory, store } = await storage();
    await new RecoveryService(store, "boot-one").started(hook, null);
    const old = JSON.parse(await readFile(join(directory, "turns.json"), "utf8"));
    delete old.automaticEnabled;
    delete old.history;
    for (const record of old.records) {
      delete record.autoEligible;
      delete record.autoAttempts;
      delete record.lastAutoAt;
    }
    await writeFile(join(directory, "turns.json"), JSON.stringify(old));
    const restored = new RecoveryStore(directory);
    expect(await restored.state()).toEqual({ enabled: false, history: [] });
    expect((await restored.all())[0]).toMatchObject({
      autoEligible: false,
      autoAttempts: 0,
      lastAutoAt: null,
    });
  });
});
