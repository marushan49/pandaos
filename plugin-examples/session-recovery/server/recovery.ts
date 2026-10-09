import type {
  OwnedSubscription,
  PaseoAgent,
  PaseoAgentListResult,
  PaseoApi,
} from "@getpaseo/client";
import type { PluginHookAgent, PluginTurnOutcome } from "@getpaseo/plugin/server";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { RecoveryCandidate, RecoveryRecord } from "../shared/contracts";
import { RecoveryStore } from "./store";

export const CONTINUE_PROMPT =
  "Setze den durch einen Absturz oder Fehler unterbrochenen Auftrag fort. Lies zuerst den gespeicherten Arbeitsstand und prüfe bereits laufende Prozesse und erledigte Schritte. Arbeite am bestehenden Ziel weiter, ohne Jobs doppelt zu starten. Halte bei einem echten Blocker an und benenne ihn konkret.";

export function daemonEpoch(): string {
  if (process.env.INVOCATION_ID) return `systemd:${process.env.INVOCATION_ID}`;
  try {
    const stat = readFileSync(`/proc/${process.ppid}/stat`, "utf8");
    const start = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
    const boot = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    return `${boot}:${process.ppid}:${start}`;
  } catch {
    return `parent:${process.ppid}`;
  }
}

export function blockedReason(agent: PaseoAgent): string | null {
  if (agent.archivedAt) return "Die Session ist archiviert.";
  if (agent.status === "running" || agent.status === "initializing" || agent.activeTurn)
    return "Die Session arbeitet bereits.";
  if (agent.pendingPermissions.length) return "Die Session wartet auf eine Freigabe.";
  if (agent.providerUnavailable) return "Der Provider ist nicht verfügbar.";
  return null;
}

function metadata(agent: PluginHookAgent | PaseoAgent) {
  return {
    agentId: agent.id,
    workspaceId: agent.workspaceId ?? null,
    title: agent.title,
    provider: agent.provider,
    cwd: agent.cwd,
  };
}

function errorSummary(message: string) {
  return message
    .split("\n", 1)[0]
    .replace(new RegExp(String.fromCharCode(27) + "\\[[0-?]*[ -/]*[@-~]", "g"), "")
    .slice(0, 1000);
}

export class RecoveryService {
  private readonly pending = new Map<string, Promise<{ accepted: boolean; messageId: string }>>();
  private initialized = false;
  private readonly agents = new Map<string, PaseoAgent>();
  private observing: Promise<void> | null = null;
  private observation: OwnedSubscription<PaseoAgentListResult> | null = null;
  private observationError: unknown = null;
  private readonly lifetime = new AbortController();

  constructor(
    readonly store: RecoveryStore,
    readonly epoch: string,
  ) {}

  async accepted(agent: PluginHookAgent, messageId: string) {
    await this.store.change(agent.id, (current) => {
      if (current?.phase === "running" && current.epoch === this.epoch)
        return { ...current, messageId, updatedAt: new Date().toISOString() };
      return this.record(agent, "accepted", null, messageId);
    });
  }

  async started(agent: PluginHookAgent, turnId: string | null) {
    await this.store.change(agent.id, (current) =>
      this.record(agent, "running", turnId, current?.messageId ?? null),
    );
  }

  async ended(agent: PluginHookAgent, turnId: string | null, outcome: PluginTurnOutcome) {
    await this.store.change(agent.id, (current) => {
      if (current?.turnId && turnId && current.turnId !== turnId) return undefined;
      const record = current ?? this.record(agent, "running", turnId, null);
      return {
        ...record,
        ...metadata(agent),
        phase: outcome.kind === "failed" ? "interrupted" : "resolved",
        reason: outcome.kind === "failed" ? errorSummary(outcome.error.message) : outcome.kind,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async closed(agent: PluginHookAgent) {
    await this.store.change(agent.id, (current) => {
      if (!current || !["accepted", "running"].includes(current.phase)) return undefined;
      return {
        ...current,
        phase: "interrupted",
        reason: "Die Session wurde während der Arbeit geschlossen.",
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async archived(agentId: string) {
    await this.store.change(agentId, (current) =>
      current ? { ...current, phase: "resolved" } : undefined,
    );
  }

  private record(
    agent: PluginHookAgent | PaseoAgent,
    phase: RecoveryRecord["phase"],
    turnId: string | null,
    messageId: string | null,
  ): RecoveryRecord {
    const now = new Date().toISOString();
    return {
      ...metadata(agent),
      revision: randomUUID(),
      epoch: this.epoch,
      phase,
      turnId,
      messageId,
      resumeMessageId: null,
      startedAt: now,
      updatedAt: now,
      reason: "",
    };
  }

  async list(paseo: PaseoApi) {
    await this.observe(paseo);
    if (this.observationError) throw this.observationError;
    for (const record of await this.store.all()) {
      if (record.phase === "resolved" || this.agents.has(record.agentId)) continue;
      const agent = (await paseo.agents.ref(record.agentId).refresh())?.agent;
      if (agent) this.agents.set(agent.id, agent);
    }
    await this.reconcile([...this.agents.values()]);
    const candidates: RecoveryCandidate[] = [];
    for (const record of await this.store.all()) {
      if (record.phase !== "interrupted" && record.phase !== "resuming") continue;
      const agent = this.agents.get(record.agentId);
      if (!agent || agent.archivedAt) continue;
      const blocked = blockedReason(agent);
      candidates.push({ ...record, canResume: !blocked, blockedReason: blocked });
    }
    return {
      candidates: candidates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      tracked: (await this.store.all()).filter(
        (record) => record.phase === "running" || record.phase === "accepted",
      ).length,
      checkedAt: new Date().toISOString(),
    };
  }

  private observe(paseo: PaseoApi) {
    if (this.observing) return this.observing;
    this.observing = this.startObservation(paseo);
    return this.observing;
  }

  private async startObservation(paseo: PaseoApi) {
    try {
      const options = {
        filter: { includeArchived: false },
        sort: [{ key: "updated_at" as const, direction: "desc" as const }],
        page: { limit: 200 },
      };
      const result = await paseo.agents.list({
        ...options,
        subscribe: {},
        signal: this.lifetime.signal,
      });
      this.observation = result.subscription;
      result.subscription.subscribe({
        snapshot: ({ entries }) => {
          this.observationError = null;
          for (const { agent } of entries) this.agents.set(agent.id, agent);
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "remove") this.agents.delete(update.agentId);
          else this.agents.set(update.agent.id, update.agent);
        },
        error: (error) => {
          this.observationError = error;
        },
      });
      for (const { agent } of result.entries) this.agents.set(agent.id, agent);
      let cursor = result.pageInfo.hasMore ? result.pageInfo.nextCursor : null;
      while (cursor) {
        const page = await paseo.agents.list({
          ...options,
          page: { limit: 200, cursor },
          signal: this.lifetime.signal,
        });
        for (const { agent } of page.entries)
          if (!this.agents.has(agent.id)) this.agents.set(agent.id, agent);
        cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor : null;
      }
    } catch (error) {
      await this.observation?.release();
      this.observation = null;
      this.observing = null;
      throw error;
    }
  }

  async close() {
    this.lifetime.abort();
    await this.observation?.release();
    await this.store.flush();
  }

  async reconcile(agents: readonly PaseoAgent[]) {
    const current = new Map((await this.store.all()).map((record) => [record.agentId, record]));
    for (const agent of agents) {
      const previous = current.get(agent.id);
      if (agent.archivedAt) {
        await this.archived(agent.id);
        continue;
      }
      if (agent.status === "running" || agent.activeTurn) {
        if (!previous || previous.epoch !== this.epoch || previous.phase === "resolved") {
          await this.store.change(agent.id, (latest) => {
            if (
              latest &&
              (!previous ||
                latest.revision !== previous.revision ||
                latest.phase !== previous.phase)
            )
              return undefined;
            return this.record(agent, "running", agent.activeTurn?.turnId ?? null, null);
          });
        }
        continue;
      }
      if (
        previous &&
        ["accepted", "running", "resuming"].includes(previous.phase) &&
        previous.epoch !== this.epoch
      ) {
        await this.store.change(agent.id, (latest) => {
          if (!latest || latest.revision !== previous.revision || latest.phase !== previous.phase)
            return undefined;
          if (
            agent.lastUserMessageAt &&
            Date.parse(agent.lastUserMessageAt) > Date.parse(previous.updatedAt) &&
            latest.phase !== "resuming"
          )
            return { ...latest, phase: "resolved" };
          return {
            ...latest,
            phase: "interrupted",
            reason: "Der Host wurde neu gestartet; für diesen Arbeitslauf fehlt ein Abschluss.",
            updatedAt: new Date().toISOString(),
          };
        });
      } else if (!previous && !this.initialized && agent.status === "error" && agent.lastError) {
        await this.store.change(agent.id, (latest) =>
          latest
            ? undefined
            : {
                ...this.record(agent, "interrupted", null, null),
                reason: errorSummary(agent.lastError!),
              },
        );
      }
    }
    this.initialized = true;
  }

  async dismiss(agentId: string, revision: string) {
    let dismissed = false;
    await this.store.change(agentId, (current) => {
      if (
        !current ||
        current.revision !== revision ||
        !["interrupted", "resuming"].includes(current.phase)
      )
        throw new Error("Die Session hat sich geändert. Aktualisiere die Liste.");
      dismissed = true;
      return { ...current, phase: "resolved", updatedAt: new Date().toISOString() };
    });
    return { dismissed };
  }

  resume(agentId: string, revision: string, paseo: PaseoApi) {
    const key = `${agentId}:${revision}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const operation = this.sendResume(agentId, revision, paseo).finally(() =>
      this.pending.delete(key),
    );
    this.pending.set(key, operation);
    return operation;
  }

  private async sendResume(agentId: string, revision: string, paseo: PaseoApi) {
    const agent = (await paseo.agents.ref(agentId).refresh())?.agent;
    if (!agent) throw new Error("Die Session existiert nicht mehr.");
    const blocked = blockedReason(agent);
    if (blocked) throw new Error(blocked);
    let messageId = "";
    let retry = false;
    await this.store.change(agentId, (current) => {
      if (
        !current ||
        current.revision !== revision ||
        !["interrupted", "resuming"].includes(current.phase)
      )
        throw new Error("Die Session hat sich geändert. Aktualisiere die Liste.");
      messageId = current.resumeMessageId ?? randomUUID();
      retry = current.resumeMessageId !== null;
      return {
        ...current,
        phase: "resuming",
        resumeMessageId: messageId,
        updatedAt: new Date().toISOString(),
      };
    });
    const handle = paseo.agents.ref(agentId);
    let alreadyAccepted = false;
    if (retry) {
      let cursor: Parameters<typeof handle.timeline.refetch>[0];
      let checkedPages = 0;
      do {
        if (++checkedPages > 25)
          throw new Error(
            "Die letzte Zustellung liegt außerhalb des prüfbaren Verlaufs. Öffne die Session und prüfe den Arbeitsstand.",
          );
        const page = await handle.timeline.refetch({
          projection: "canonical",
          limit: 200,
          ...cursor,
        });
        if (page.error || page.gap || page.staleCursor)
          throw new Error(
            "Die letzte Zustellung konnte nicht geprüft werden. Aktualisiere die Session vor einem weiteren Versuch.",
          );
        alreadyAccepted = page.entries.some(
          ({ item }) =>
            item.type === "user_message" &&
            (item.clientMessageId === messageId || item.messageId === messageId),
        );
        if (alreadyAccepted || !page.hasOlder || !page.startCursor) break;
        cursor = { direction: "before", cursor: page.startCursor };
      } while (!alreadyAccepted);
    }
    if (!alreadyAccepted)
      await handle.send(CONTINUE_PROMPT, { messageId, activeTurnBehavior: "steer" });
    await this.store.change(agentId, (current) =>
      current?.revision === revision
        ? { ...current, phase: "resolved", updatedAt: new Date().toISOString() }
        : undefined,
    );
    return { accepted: true, messageId };
  }
}
