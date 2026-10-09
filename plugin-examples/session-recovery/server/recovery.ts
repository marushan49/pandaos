import type {
  PluginHandlerContext,
  PluginHookAgent,
  PluginTurnOutcome,
} from "@getpaseo/plugin/server";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { RecoveryCandidate, RecoveryRecord, RecoveryEvent } from "../shared/contracts";
import { RecoveryStore } from "./store";

type PaseoApi = PluginHandlerContext["paseo"];
type PaseoAgentListResult = Awaited<ReturnType<PaseoApi["agents"]["list"]>>;
type PaseoAgent = PaseoAgentListResult["entries"][number]["agent"];
type AgentObservation = NonNullable<PaseoAgentListResult["subscription"]>;

export const MAX_AUTOMATIC_ATTEMPTS = 3;

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
  private observation: AgentObservation | null = null;
  private observationError: unknown = null;
  private readonly lifetime = new AbortController();
  private automaticTimer: ReturnType<typeof setTimeout> | null = null;
  private automaticBusy = false;
  private automaticAgentId: string | null = null;
  private automaticWork: Promise<void> | null = null;
  private disposed = false;

  constructor(
    readonly store: RecoveryStore,
    readonly epoch: string,
    private readonly options: { automaticDelayMs?: number; autoSchedule?: boolean } = {},
  ) {}

  async accepted(
    agent: PluginHookAgent,
    messageId: string,
    origin: "client" | "plugin" | "unknown" = "unknown",
  ) {
    await this.store.change(agent.id, (current) => {
      if (current?.phase === "running" && current.epoch === this.epoch)
        return {
          ...current,
          messageId,
          ...(origin === "client" ? { autoAttempts: 0, lastAutoAt: null } : {}),
          updatedAt: new Date().toISOString(),
        };
      const next = this.record(agent, "accepted", null, messageId, current);
      if (current?.resumeMessageId !== messageId)
        return { ...next, autoAttempts: 0, lastAutoAt: null };
      return next;
    });
  }

  async started(agent: PluginHookAgent, turnId: string | null) {
    await this.store.change(agent.id, (current) =>
      this.record(agent, "running", turnId, current?.messageId ?? null, current),
    );
  }

  async ended(agent: PluginHookAgent, turnId: string | null, outcome: PluginTurnOutcome) {
    if (this.automaticAgentId === agent.id) this.automaticAgentId = null;
    await this.store.change(agent.id, (current) => {
      if (current?.turnId && turnId && current.turnId !== turnId) return undefined;
      const record = current ?? this.record(agent, "running", turnId, null);
      return {
        ...record,
        ...metadata(agent),
        phase: outcome.kind === "failed" ? "interrupted" : "resolved",
        reason: outcome.kind === "failed" ? errorSummary(outcome.error.message) : outcome.kind,
        autoEligible:
          outcome.kind === "failed" &&
          !/(?:auth|unauthoriz|invalid.?token|quota|rate.?limit|usage.?limit|context.?length)/i.test(
            outcome.error.code ?? errorSummary(outcome.error.message),
          ),
        autoAttempts: outcome.kind !== "failed" ? 0 : record.autoAttempts,
        lastAutoAt: outcome.kind !== "failed" ? null : record.lastAutoAt,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async closed(agent: PluginHookAgent) {
    if (this.automaticAgentId === agent.id) this.automaticAgentId = null;
    await this.store.change(agent.id, (current) => {
      if (!current || !["accepted", "running", "interrupted", "resuming"].includes(current.phase))
        return undefined;
      return {
        ...current,
        phase: "interrupted",
        reason: "Die Session wurde während der Arbeit geschlossen.",
        autoEligible: false,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async archived(agentId: string) {
    if (this.automaticAgentId === agentId) this.automaticAgentId = null;
    await this.store.change(agentId, (current) =>
      current ? { ...current, phase: "resolved" } : undefined,
    );
  }

  private record(
    agent: PluginHookAgent | PaseoAgent,
    phase: RecoveryRecord["phase"],
    turnId: string | null,
    messageId: string | null,
    previous?: RecoveryRecord,
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
      autoEligible: true,
      autoAttempts: previous?.autoAttempts ?? 0,
      lastAutoAt: previous?.lastAutoAt ?? null,
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
    const state = await this.store.state();
    this.scheduleAutomatic(paseo);
    return {
      automatic: {
        enabled: state.enabled,
        maxAttempts: MAX_AUTOMATIC_ATTEMPTS,
        waiting: candidates.filter(
          (record) => record.autoEligible && record.autoAttempts < MAX_AUTOMATIC_ATTEMPTS,
        ).length,
      },
      history: state.history,
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
          this.scheduleAutomatic(paseo);
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "remove") {
            this.agents.delete(update.agentId);
            this.scheduleAutomatic(paseo);
          } else {
            const previous = this.agents.get(update.agent.id);
            this.agents.set(update.agent.id, update.agent);
            if (
              !previous ||
              previous.status !== update.agent.status ||
              previous.pendingPermissions.length !== update.agent.pendingPermissions.length ||
              previous.providerUnavailable !== update.agent.providerUnavailable ||
              previous.archivedAt !== update.agent.archivedAt
            )
              this.scheduleAutomatic(paseo);
          }
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
    this.disposed = true;
    if (this.automaticTimer) clearTimeout(this.automaticTimer);
    this.automaticTimer = null;
    this.lifetime.abort();
    await this.automaticWork;
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
            return this.record(agent, "running", agent.activeTurn?.turnId ?? null, null, latest);
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
            autoEligible: true,
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
                autoEligible: false,
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

  async configureAutomatic(enabled: boolean, paseo: PaseoApi) {
    await this.store.setAutomatic(enabled);
    if (this.automaticTimer) clearTimeout(this.automaticTimer);
    this.automaticTimer = null;
    if (enabled) {
      await this.list(paseo);
      this.scheduleAutomatic(paseo);
    }
    return { enabled };
  }

  scheduleAutomatic(paseo: PaseoApi, delay = this.options.automaticDelayMs ?? 2500) {
    if (
      this.disposed ||
      this.automaticBusy ||
      this.automaticTimer ||
      this.options.autoSchedule === false
    )
      return;
    this.automaticTimer = setTimeout(
      () => {
        this.automaticTimer = null;
        const work = this.runAutomatic(paseo).catch((error) =>
          console.error("Automatische Recovery fehlgeschlagen", error),
        );
        this.automaticWork = work;
        void work.finally(() => {
          if (this.automaticWork === work) this.automaticWork = null;
        });
      },
      Math.max(0, delay),
    );
  }

  private automaticCandidate(record: RecoveryCandidate) {
    return record.autoEligible && record.autoAttempts < MAX_AUTOMATIC_ATTEMPTS && record.canResume;
  }

  private async automaticWorkRunning(paseo: PaseoApi) {
    if (this.automaticAgentId) return true;
    for (const record of await this.store.all()) {
      if (!record.autoAttempts) continue;
      const current = (await paseo.agents.ref(record.agentId).refresh())?.agent;
      if (
        current &&
        (current.status === "running" || current.status === "initializing" || current.activeTurn)
      )
        return true;
    }
    return false;
  }

  async runAutomatic(paseo: PaseoApi) {
    if (this.disposed || this.automaticBusy) return;
    const state = await this.store.state();
    if (!state.enabled || this.disposed || this.automaticBusy) return;
    this.automaticBusy = true;
    let nextDelay: number | null = null;
    try {
      const { candidates } = await this.list(paseo);
      if (await this.automaticWorkRunning(paseo)) return;
      for (const record of candidates.filter((candidate) => this.automaticCandidate(candidate))) {
        const delay = (this.options.automaticDelayMs ?? 2500) * Math.pow(2, record.autoAttempts);
        const due = Date.parse(record.lastAutoAt ?? record.updatedAt) + delay;
        if (due > Date.now()) {
          nextDelay = Math.min(nextDelay ?? Infinity, due - Date.now());
          continue;
        }
        if (this.disposed || !(await this.store.state()).enabled) return;
        try {
          await this.resume(record.agentId, record.revision, paseo, "automatic");
        } catch (error) {
          console.error(
            "Session konnte nicht automatisch fortgesetzt werden",
            record.agentId,
            error,
          );
        }
        nextDelay = this.options.automaticDelayMs ?? 2500;
        break;
      }
    } finally {
      this.automaticBusy = false;
      if (nextDelay !== null && !this.disposed) this.scheduleAutomatic(paseo, nextDelay);
    }
  }

  resume(
    agentId: string,
    revision: string,
    paseo: PaseoApi,
    mode: RecoveryEvent["mode"] = "manual",
  ) {
    const key = `${agentId}:${revision}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const operation = this.sendResume(agentId, revision, paseo, mode).finally(() =>
      this.pending.delete(key),
    );
    this.pending.set(key, operation);
    return operation;
  }

  private async publishEvent(event: RecoveryEvent, paseo: PaseoApi) {
    await this.store.event(event);
    if (event.status === "pending") return;
    await paseo.agents.ref(event.agentId).timeline.append({
      type: "plugin",
      id: this.timelineId(event),
      kind: "recovery-event",
      version: 1,
      data: event,
    });
  }

  private timelineId(event: RecoveryEvent) {
    const content = createHash("sha256").update(JSON.stringify(event)).digest("hex").slice(0, 16);
    return `${event.id}:${event.status}:${content}`;
  }

  private async claimResume(agentId: string, revision: string, mode: RecoveryEvent["mode"]) {
    let interrupted!: RecoveryRecord;
    let messageId = "";
    let retry = false;
    await this.store.change(agentId, (current) => {
      if (
        !current ||
        current.revision !== revision ||
        !["interrupted", "resuming"].includes(current.phase)
      )
        throw new Error("Die Session hat sich geändert. Aktualisiere die Liste.");
      if (
        mode === "automatic" &&
        (!current.autoEligible || current.autoAttempts >= MAX_AUTOMATIC_ATTEMPTS)
      )
        throw new Error(
          "Automatische Wiederholungen sind ausgeschöpft. Setze die Session manuell fort.",
        );
      interrupted = current;
      messageId = current.resumeMessageId ?? randomUUID();
      retry = current.resumeMessageId !== null;
      const automatic = mode === "automatic";
      const newAttempt = automatic && !retry;
      let autoAttempts = current.autoAttempts;
      let lastAutoAt = current.lastAutoAt;
      if (newAttempt) {
        autoAttempts++;
        lastAutoAt = new Date().toISOString();
      }
      if (!automatic) {
        autoAttempts = 0;
        lastAutoAt = null;
      }
      return {
        ...current,
        phase: "resuming",
        resumeMessageId: messageId,
        autoAttempts,
        lastAutoAt,
        updatedAt: new Date().toISOString(),
      };
    });
    return { interrupted, messageId, retry };
  }

  private async previouslyAccepted(agentId: string, messageId: string, paseo: PaseoApi) {
    const handle = paseo.agents.ref(agentId);
    let cursor: Parameters<typeof handle.timeline.refetch>[0];
    for (let checkedPages = 0; checkedPages < 25; checkedPages++) {
      const page = await handle.timeline.refetch({
        projection: "canonical",
        limit: 200,
        ...cursor,
      });
      if (page.error || page.gap || page.staleCursor)
        throw new Error(
          "Die letzte Zustellung konnte nicht geprüft werden. Aktualisiere die Session vor einem weiteren Versuch.",
        );
      if (
        page.entries.some(
          ({ item }) =>
            item.type === "user_message" &&
            (item.clientMessageId === messageId || item.messageId === messageId),
        )
      )
        return true;
      if (!page.hasOlder || !page.startCursor) return false;
      cursor = { direction: "before", cursor: page.startCursor };
    }
    throw new Error(
      "Die letzte Zustellung liegt außerhalb des prüfbaren Verlaufs. Öffne die Session und prüfe den Arbeitsstand.",
    );
  }

  private async dispatchResume(event: RecoveryEvent, paseo: PaseoApi) {
    if (this.disposed || (event.mode === "automatic" && !(await this.store.state()).enabled))
      throw new Error("Automatische Fortsetzung wurde gestoppt.");
    const handle = paseo.agents.ref(event.agentId);
    const latest = (await handle.refresh())?.agent;
    if (!latest) throw new Error("Die Session existiert nicht mehr.");
    const blocked = blockedReason(latest);
    if (blocked) throw new Error(blocked);
    const record = (await this.store.all()).find((current) => current.agentId === event.agentId);
    if (record?.phase !== "resuming" || record.resumeMessageId !== event.messageId)
      throw new Error("Die Session wurde inzwischen gestoppt oder geändert.");
    const label = event.mode === "automatic" ? "Automatische Fortsetzung" : "Manuelle Fortsetzung";
    const prompt = `${label} durch Session Recovery am ${event.at}.\nGrund: ${event.reason}\n\n${CONTINUE_PROMPT}`;
    if (event.mode === "automatic") this.automaticAgentId = event.agentId;
    await handle.send(prompt, { messageId: event.messageId!, activeTurnBehavior: "steer" });
  }

  private async failedResume(
    event: RecoveryEvent,
    revision: string,
    error: unknown,
    paseo: PaseoApi,
  ) {
    if (this.automaticAgentId === event.agentId) this.automaticAgentId = null;
    const failure =
      error instanceof Error ? errorSummary(error.message) : "Fortsetzung fehlgeschlagen";
    const failed: RecoveryEvent = { ...event, status: "failed", error: failure };
    await this.store.event(failed);
    await paseo.agents
      .ref(event.agentId)
      .timeline.append({
        type: "plugin",
        id: this.timelineId(failed),
        kind: "recovery-event",
        version: 1,
        data: failed,
      })
      .catch((timelineError) =>
        console.error("Recovery-Verlauf konnte nicht geschrieben werden", timelineError),
      );
    if (event.mode === "automatic")
      await this.store.change(event.agentId, (current) =>
        current?.revision === revision ? { ...current, autoEligible: false } : undefined,
      );
  }

  private async sendResume(
    agentId: string,
    revision: string,
    paseo: PaseoApi,
    mode: RecoveryEvent["mode"],
  ) {
    const agent = (await paseo.agents.ref(agentId).refresh())?.agent;
    if (!agent) throw new Error("Die Session existiert nicht mehr.");
    const blocked = blockedReason(agent);
    if (blocked) throw new Error(blocked);
    const { messageId, retry, interrupted } = await this.claimResume(agentId, revision, mode);
    const prior = (await this.store.state()).history.find((event) => event.id === messageId);
    const event: RecoveryEvent = prior ?? {
      id: messageId,
      agentId,
      title: agent.title,
      provider: agent.provider,
      at: new Date().toISOString(),
      mode,
      status: "pending",
      reason: interrupted.reason || "Unterbrochener Arbeitslauf",
      error: null,
      messageId,
    };
    try {
      await this.publishEvent({ ...event, status: "pending", error: null }, paseo);
      const alreadyAccepted = retry && (await this.previouslyAccepted(agentId, messageId, paseo));
      if (!alreadyAccepted) await this.dispatchResume(event, paseo);
      await this.publishEvent({ ...event, status: "resumed", error: null }, paseo);
      await this.store.change(agentId, (current) =>
        current?.revision === revision
          ? { ...current, phase: "resolved", updatedAt: new Date().toISOString() }
          : undefined,
      );
      return { accepted: true, messageId };
    } catch (error) {
      await this.failedResume(event, revision, error, paseo);
      throw error;
    }
  }
}
