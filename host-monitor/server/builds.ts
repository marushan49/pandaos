import { execFile } from "node:child_process";
import { basename, dirname } from "node:path";
import { promisify } from "node:util";
import type { HostBuildJob, HostBuilds } from "../shared/host";

const run = promisify(execFile);
const CLI = "/usr/local/bin/pandaos-build-scheduler";
const NAMES: Record<string, string> = { pandaos: "PandaOS" };
const LABELS: Record<string, string> = {
  "play-release": "Play release",
  "ios-release": "iOS release",
  "android-build": "Android build",
  "android-update": "Android update",
};

type RawJob = Record<string, unknown>;
interface RawStatus {
  event?: string;
  error?: string;
  jobs?: RawJob[];
  legacy_jobs?: RawJob[];
  workers?: Record<string, Record<string, unknown>>;
  config?: { workers?: Record<string, boolean> };
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export function product(job: RawJob): { product: string; worktree: string | null } {
  const explicit = text(job.product);
  const path = text(job.project);
  const marker = path.indexOf("/.worktrees/");
  const worktree = marker >= 0 ? basename(path) : null;
  if (explicit) return { product: explicit, worktree };
  let name = marker >= 0 ? basename(path.slice(0, marker)) : basename(path);
  if (basename(dirname(path)) === "pandaos-releases") name = "pandaos";
  name = name.replace(/-[0-9a-f]{7,}$/, "");
  return { product: NAMES[name] ?? (name || "unknown"), worktree };
}

function gradleKind(name: string) {
  if (name.startsWith("bundle")) return "AAB";
  if (name.startsWith("install")) return "install";
  return "APK";
}

const variant = (name: string) =>
  name.replace(/^(assemble|bundle|install)/, "").toLowerCase() || "default";

export function task(job: RawJob): string {
  const label = text(job.label);
  if (LABELS[label]) return LABELS[label];
  const raw = text(job.command);
  const wrapped = raw.match(/^(?:\S*\/)?(?:bash|sh|zsh)\s+-\w*c\s+([\s\S]*)$/);
  const command = wrapped ? wrapped[1] : raw;
  const known = describe(command);
  if (known) return known;
  if (/^(?:\S*\/)?python3?\s+-c\b/.test(command)) return label || "Python script";
  if (wrapped) return label || "Shell command";
  if (label) return label;
  const words = command.split(/\s+/).filter((word) => word && !word.startsWith("-"));
  const script = words.find((word) => /\.(sh|py|mjs|js|ts)$/.test(word));
  if (script) return basename(script);
  return words
    .slice(0, 2)
    .map((word) => basename(word))
    .join(" ")
    .slice(0, 48);
}

function describe(command: string): string | null {
  const gradle = command.match(/gradlew\b.*?\b(assemble\w+|bundle\w+|install\w+)/);
  if (gradle) return `Android ${gradleKind(gradle[1])} (${variant(gradle[1])})`;
  if (/gradlew\b.*\btest\w*/.test(command)) return "Android tests";
  const flutter = command.match(/flutter\s+(build|test|run)\s*(\w+)?/);
  if (flutter)
    return flutter[1] === "test" ? "Flutter tests" : `Flutter ${flutter[2] ?? flutter[1]}`;
  if (/xcodebuild\b.*\barchive\b/.test(command)) return "iOS archive";
  if (/xcodebuild\b.*\btest\b/.test(command)) return "iOS tests";
  if (/xcodebuild/.test(command)) return "iOS build";
  const cargo = command.match(/cargo\s+(test|build|check|clippy|run)\b/);
  if (cargo) return `Rust ${cargo[1] === "test" ? "tests" : cargo[1]}`;
  const npm = command.match(/\b(npm|pnpm|yarn|bun)\s+(?:run\s+)?([\w:.-]+)/);
  if (npm) return `${npm[1]} ${npm[2]}`;
  if (/\bvitest\b/.test(command)) return "Tests (vitest)";
  const module = command.match(/python3?\s+-m\s+([\w.]+)/);
  if (module) return `Python ${module[1].split(".").pop()}`;
  return null;
}

function placement(job: RawJob) {
  const decision = job.placement as { worker?: string; candidates?: RawJob[] } | null;
  if (!decision?.candidates || decision.candidates.length < 2) return null;
  const others = decision.candidates
    .filter((candidate) => candidate.worker !== decision.worker)
    .map((candidate) => {
      const why = text(candidate.blocked) || text(candidate.reason);
      const name = candidate.worker === "local" ? "Zotac" : text(candidate.worker);
      return why ? `${name}: ${why}` : `${name} about ${Math.round(number(candidate.eta) ?? 0)} s`;
    });
  return others.length ? `Chosen over ${others.join("; ")}` : null;
}

function workerName(worker: string) {
  return worker === "local" ? "Zotac" : worker;
}

export function summarizeJob(job: RawJob): HostBuildJob {
  const measured = (job.measured ?? {}) as Record<string, unknown>;
  const usage = (job.usage ?? {}) as Record<string, unknown>;
  const cache = (job.cache ?? {}) as { artifacts?: { paths?: string[]; directory?: string } };
  const started = number(job.started);
  const finished = number(job.finished);
  const state = (
    text(job.state) === "starting" ? "running" : text(job.state)
  ) as HostBuildJob["state"];
  const elapsed = started ? Math.round((finished ?? Date.now() / 1000) - started) : null;
  const peak = number(measured.peak_memory);
  const directory = cache.artifacts?.directory;
  return {
    id: text(job.id),
    sequence: number(job.sequence) ?? 0,
    state,
    ...product(job),
    task: task(job),
    worker: workerName(text(job.worker) || "local"),
    seconds: state === "queued" ? null : (number(measured.wall) ?? elapsed),
    waited: number(job.waited),
    exit: number(job.exit),
    reason: text(job.wait_reason) || text(job.reason) || null,
    placement: placement(job),
    memoryGb: number(usage.memory_gib) ?? (peak !== null ? peak / 1024 ** 3 : null),
    artifacts: (cache.artifacts?.paths ?? []).map((path) =>
      directory ? `${directory}/${path}` : path,
    ),
    finishedAt: finished,
  };
}

function legacy(job: RawJob): HostBuildJob {
  const queued = text(job.state) === "queued";
  return {
    id: `legacy-${text(job.id)}`,
    sequence: number(job.sequence) ?? 0,
    state: queued ? "queued" : "running",
    product: "Old queue",
    task: `Job #${number(job.sequence) ?? "?"}`,
    worktree: null,
    worker: "Zotac",
    seconds: null,
    waited: null,
    exit: null,
    reason: queued ? "waiting in the old single-slot broker" : null,
    placement: null,
    memoryGb: null,
    artifacts: [],
    finishedAt: null,
  };
}

export function summarizeBuilds(raw: RawStatus): HostBuilds {
  if (raw.event === "error") {
    return {
      available: false,
      error: raw.error ?? "scheduler error",
      running: 0,
      queued: 0,
      jobs: [],
      workers: [],
    };
  }
  const jobs = (raw.jobs ?? []).map(summarizeJob);
  jobs.push(...(raw.legacy_jobs ?? []).filter((job) => text(job.state) !== "finished").map(legacy));
  const order = { running: 0, queued: 1, finished: 2 } as const;
  jobs.sort((a, b) => {
    if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
    if (a.state === "finished") return (b.finishedAt ?? 0) - (a.finishedAt ?? 0);
    return a.sequence - b.sequence;
  });
  const active = jobs.filter((job) => job.state !== "finished");
  const recent = jobs.filter((job) => job.state === "finished").slice(0, 5);
  const workers: HostBuilds["workers"] = [{ name: "Zotac", state: "ready", detail: "controller" }];
  for (const [name, enabled] of Object.entries(raw.config?.workers ?? {})) {
    const probe = raw.workers?.[name] ?? {};
    if (!enabled) workers.push({ name, state: "disabled", detail: "disabled" });
    else if (probe.error || !probe.sampled_at)
      workers.push({ name, state: "offline", detail: "unreachable" });
    else {
      const power = probe.on_ac === false ? `battery ${number(probe.battery) ?? "?"}%` : "on power";
      const free = ((number(probe.available_memory) ?? 0) / 1024 ** 3).toFixed(0);
      workers.push({ name, state: "ready", detail: `${free} GB free, ${power}` });
    }
  }
  return {
    available: true,
    error: null,
    running: active.filter((job) => job.state === "running").length,
    queued: active.filter((job) => job.state === "queued").length,
    jobs: [...active, ...recent],
    workers,
  };
}

export async function readBuilds(): Promise<HostBuilds> {
  try {
    const { stdout } = await run(CLI, ["--json", "status", "15"], {
      timeout: 15_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return summarizeBuilds(JSON.parse(stdout) as RawStatus);
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message.slice(0, 200) : "build scheduler unavailable",
      running: 0,
      queued: 0,
      jobs: [],
      workers: [],
    };
  }
}
