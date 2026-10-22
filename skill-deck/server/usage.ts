import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { PluginLifecycleEvents, PluginServerContext } from "@getpaseo/plugin/server";
import type { Skill } from "../shared/contracts";
import { hash } from "./inventory";

const recordSchema = z.object({
  skillId: z.string(),
  provider: z.string(),
  count: z.number().int().nonnegative(),
  lastUsedAt: z.string(),
});
const stateSchema = z.object({
  since: z.string(),
  records: z.array(recordSchema),
  seen: z.array(z.string()),
});
type State = z.infer<typeof stateSchema>;
type Ended = PluginLifecycleEvents["agent.turn_ended"];
const skillInputSchema = z.object({ skill: z.string() });

function matchesSkill(skill: Skill, requested: string, provider: string): boolean {
  const providerBase =
    provider === "codex-plus" || provider === "codex-business" ? "codex" : provider;
  if (!skill.providers.includes(provider) && !skill.providers.includes(providerBase)) return false;
  const qualified = /^([^:]+):([^:]+)$/.exec(requested);
  if (!qualified) return skill.name === requested;
  if (skill.name !== requested && skill.name !== qualified[2]) return false;
  if (!skill.realPath) return false;
  const plugin =
    /[\\/]plugins[\\/]cache[\\/][^\\/]+[\\/]([^\\/]+)[\\/][^\\/]+[\\/]skills[\\/]/.exec(
      skill.realPath,
    )?.[1];
  return plugin === qualified[1];
}

export async function observedSkillIds(
  event: Ended,
  messageId: string,
  getSkills: () => Promise<Skill[]>,
): Promise<{ callId: string; skillId: string }[]> {
  const marker = event.timeline.findLastIndex(
    (item) =>
      (item.type === "user_message" &&
        (item.messageId === messageId || item.clientMessageId === messageId)) ||
      (item.type === "tool_call" &&
        item.name === "agent_message" &&
        item.callId === `paseo-agent-message:${messageId}`),
  );
  if (marker < 0) return [];
  let skills: Skill[] | undefined;
  const calls: { callId: string; skillId: string }[] = [];
  for (const item of event.timeline.slice(marker + 1)) {
    if (item.type !== "tool_call" || item.status !== "completed") continue;
    if (item.detail.type === "read" && path.basename(item.detail.filePath) === "SKILL.md") {
      const file = await realpath(path.resolve(event.agent.cwd, item.detail.filePath)).catch(
        () => null,
      );
      if (file) calls.push({ callId: item.callId, skillId: hash(file) });
    }
    if (item.name.toLowerCase() === "skill" && item.detail.type === "unknown") {
      const input = skillInputSchema.safeParse(item.detail.input);
      if (input.success) {
        skills ??= await getSkills();
        const matching = skills.filter((skill) =>
          matchesSkill(skill, input.data.skill, event.agent.provider),
        );
        if (matching.length === 1 && matching[0])
          calls.push({ callId: item.callId, skillId: matching[0].id });
      }
    }
  }
  return calls;
}

export function createUsage(
  server: Pick<PluginServerContext, "dataDirectory" | "supportsLifecycleEvent" | "on">,
  getSkills: (cwd: string) => Promise<Skill[]>,
) {
  let state: State = { since: new Date().toISOString(), records: [], seen: [] };
  let writeError = false;
  const file = server.dataDirectory ? path.join(server.dataDirectory, "usage.json") : null;
  const ready = file
    ? readFile(file, "utf8")
        .then((content) => {
          state = stateSchema.parse(JSON.parse(content));
          return undefined;
        })
        .catch((error: unknown) => {
          if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
            writeError = true;
        })
    : Promise.resolve();
  let pending = ready;
  const markers = new Map<string, string>();
  const active = Boolean(
    file &&
    server.supportsLifecycleEvent("agent.user_message_accepted") &&
    server.supportsLifecycleEvent("agent.turn_ended"),
  );
  const removers: (() => void)[] = [];
  if (active) {
    removers.push(
      server.on("agent.user_message_accepted", ({ agent, messageId }) => {
        if (!markers.has(agent.id)) markers.set(agent.id, messageId);
      }),
    );
    removers.push(
      server.on("agent.closed", ({ agent }) => {
        markers.delete(agent.id);
      }),
    );
    removers.push(
      server.on("agent.turn_ended", (event) => {
        const marker = markers.get(event.agent.id);
        if (!marker) return;
        markers.delete(event.agent.id);
        pending = pending
          .then(async () => {
            if (writeError || !file) return undefined;
            const calls = await observedSkillIds(event, marker, () => getSkills(event.agent.cwd));
            let changed = false;
            for (const call of calls) {
              const id = hash(`${event.agent.id}:${call.callId}`);
              if (state.seen.includes(id)) continue;
              changed = true;
              state.seen.push(id);
              const record = state.records.find(
                (entry) =>
                  entry.skillId === call.skillId && entry.provider === event.agent.provider,
              );
              if (record) {
                record.count++;
                record.lastUsedAt = new Date().toISOString();
              } else
                state.records.push({
                  skillId: call.skillId,
                  provider: event.agent.provider,
                  count: 1,
                  lastUsedAt: new Date().toISOString(),
                });
            }
            if (!changed) return undefined;
            state.seen = state.seen.slice(-50000);
            await mkdir(path.dirname(file), { recursive: true });
            await writeFile(`${file}.tmp`, JSON.stringify(state), { mode: 0o600 });
            await rename(`${file}.tmp`, file);
            return undefined;
          })
          .catch(() => {
            writeError = true;
          });
        return pending;
      }),
    );
  }
  return {
    async apply(skills: Skill[]) {
      await pending;
      for (const skill of skills)
        skill.usage = state.records
          .filter((record) => record.skillId === skill.id)
          .map(({ skillId: _id, ...record }) => record);
      return {
        since: state.since,
        active: active && !writeError,
        limitation: writeError
          ? "Nutzungsdatei nicht lesbar oder schreibbar; Beobachtung angehalten."
          : "Nur während aktiver Plugin-Laufzeiten: erfolgreiche Read-SKILL.md- und eindeutige Skill-Toolaufrufe. Lücken sind möglich. Shell-Leseaufrufe, frühere Sitzungen und nicht zuordenbare Provider bleiben unbeobachtet. Cache-Dateien und Providerpfade belegen keine aktive Bereitstellung.",
      };
    },
    async close() {
      for (const remove of removers) remove();
      await pending;
    },
  };
}
