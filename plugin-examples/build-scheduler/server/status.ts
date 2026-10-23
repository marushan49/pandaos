import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import type { BuildJob, BuildStatus, BuildWorker } from "../shared/status";

const run = promisify(execFile);
const CLI = "/usr/local/bin/pandaos-build-scheduler";

type RawJob = Record<string, unknown>;
interface RawStatus {
  jobs?: RawJob[];
  workers?: Record<string, Record<string, unknown>>;
  config?: { workers?: Record<string, boolean> };
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function task(job: RawJob) {
  const label = text(job.label);
  if (label) return label;
  const words = text(job.command).split(/\s+/).filter(Boolean);
  const meaningful = words.filter((word) => !word.startsWith("-") && !word.startsWith("/"));
  return (meaningful.slice(0, 3).join(" ") || words.slice(0, 2).join(" ")).slice(0, 60);
}

function placement(job: RawJob) {
  const decision = job.placement as { worker?: string; eta?: number; candidates?: RawJob[] } | null;
  if (!decision?.candidates?.length) return null;
  const parts = decision.candidates.map((candidate) => {
    const name = text(candidate.worker);
    if (candidate.blocked) return `${name}: ${text(candidate.blocked)}`;
    if (candidate.reason) return `${name}: ${text(candidate.reason)}`;
    return `${name}: ca. ${Math.round((number(candidate.eta) ?? 0) / 60)} min`;
  });
  return `${decision.worker} gewählt (${parts.join(", ")})`;
}

export function summarizeJob(job: RawJob): BuildJob {
  const measured = (job.measured ?? {}) as Record<string, unknown>;
  const usage = (job.usage ?? {}) as Record<string, unknown>;
  const cache = (job.cache ?? {}) as { artifacts?: { paths?: string[]; directory?: string } };
  const started = number(job.started);
  const finished = number(job.finished);
  const state = text(job.state) as BuildJob["state"];
  const elapsed = started ? Math.round((finished ?? Date.now() / 1000) - started) : null;
  const seconds = number(measured.wall) ?? elapsed;
  const directory = cache.artifacts?.directory;
  return {
    id: text(job.id),
    sequence: number(job.sequence) ?? 0,
    state,
    project: basename(text(job.project)) || "–",
    task: task(job),
    worker: text(job.worker) || "local",
    klass: text(job.klass),
    priority: text(job.priority),
    agent: text(job.agent).slice(0, 8),
    seconds: state === "queued" ? null : seconds,
    waited: number(job.waited),
    exit: number(job.exit),
    reason: text(job.wait_reason) || text(job.reason) || null,
    placement: placement(job),
    memoryGib:
      number(usage.memory_gib) ??
      (number(measured.peak_memory) !== null
        ? (number(measured.peak_memory) ?? 0) / 1024 ** 3
        : null),
    artifacts: (cache.artifacts?.paths ?? []).map((path) =>
      directory ? `${directory}/${path}` : path,
    ),
    finishedAt: finished,
  };
}

export function summarizeWorkers(raw: RawStatus): BuildWorker[] {
  const workers: BuildWorker[] = [{ name: "Zotac", state: "ready", detail: "Controller" }];
  for (const [name, enabled] of Object.entries(raw.config?.workers ?? {})) {
    const probe = raw.workers?.[name] ?? {};
    if (!enabled) workers.push({ name, state: "disabled", detail: "deaktiviert" });
    else if (probe.error || !probe.sampled_at)
      workers.push({ name, state: "offline", detail: "nicht erreichbar" });
    else {
      const power = probe.on_ac === false ? `Akku ${number(probe.battery) ?? "?"} %` : "Netzteil";
      const free = ((number(probe.available_memory) ?? 0) / 1024 ** 3).toFixed(0);
      workers.push({ name, state: "ready", detail: `${free} GiB frei · ${power}` });
    }
  }
  return workers;
}

export function summarize(raw: RawStatus): BuildStatus {
  const jobs = (raw.jobs ?? []).map(summarizeJob);
  const order = { running: 0, queued: 1, finished: 2 } as const;
  jobs.sort((a, b) => {
    if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
    if (a.state === "finished") return (b.finishedAt ?? 0) - (a.finishedAt ?? 0);
    return a.sequence - b.sequence;
  });
  return { available: true, error: null, jobs, workers: summarizeWorkers(raw) };
}

export async function buildStatus(input: { recent: number }): Promise<BuildStatus> {
  try {
    const { stdout } = await run(CLI, ["--json", "status", String(input.recent)], {
      timeout: 15_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return summarize(JSON.parse(stdout) as RawStatus);
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message.slice(0, 200) : "Scheduler nicht erreichbar",
      jobs: [],
      workers: [],
    };
  }
}
