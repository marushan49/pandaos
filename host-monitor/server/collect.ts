import { execFile } from "node:child_process";
import { readFile, readlink } from "node:fs/promises";
import { cpus } from "node:os";
import { basename } from "node:path";
import { promisify } from "node:util";
import type { HostConsumer, HostSnapshot } from "../shared/host";
import { startProfiles, verdictFor } from "./profiles";

const execFileAsync = promisify(execFile);
const KB_PER_GB = 1024 * 1024;
const MIN_PROCESS_KB = 20 * 1024;
const AGENT_ID_KEY = "PASEO_AGENT_ID=";
const HOME_KEY = "PASEO_HOME=";
const STOPPABLE_KINDS = new Set([
  "emulator",
  "daemon",
  "nest-watch",
  "tsc-watch",
  "backend-app",
  "dev-orchestrator",
  "expo-metro",
  "test-worker",
  "gradle",
]);
const CONSUMER_LIMIT = 15;
const OWNER_LIMIT = 8;
const TREND_WINDOW_MS = 30 * 60 * 1000;
const IDLE_KINDS = new Set(["emulator", "nest-watch", "backend-app", "expo-metro", "daemon"]);

export type HostReading = Omit<HostSnapshot, "history" | "agents" | "tabs" | "tabsClosable"> & {
  footprints: AgentFootprint[];
  stopTargets: Map<number, StopTarget>;
};

export type StopTarget = { type: "unit"; unit: string } | { type: "pid"; pid: number };

export interface AgentFootprint {
  agentId: string;
  processes: number;
  gb: number;
  unit: string | null;
  folder: string | null;
}
type MemoryReading = Awaited<ReturnType<typeof readMemory>>;

export interface HistoryPoint {
  at: string;
  availableGb: number;
}

interface ProcessRow {
  pid: number;
  ppid: number;
  rssKb: number;
  ageSec: number;
  args: string;
}

const kindRules: Array<{ pattern: RegExp; kind: string; label: string }> = [
  { pattern: /qemu-system/, kind: "emulator", label: "Emulator" },
  { pattern: /nest start --watch/, kind: "nest-watch", label: "Nest watcher" },
  { pattern: /--enable-source-maps/, kind: "backend-app", label: "Backend app" },
  { pattern: /\btsc\b.*--watch/, kind: "tsc-watch", label: "tsc watcher" },
  { pattern: /\bconcurrently\b/, kind: "dev-orchestrator", label: "Dev orchestrator" },
  { pattern: /expo start|\bmetro\b/i, kind: "expo-metro", label: "Expo/Metro" },
  { pattern: /jest-worker|processChild/, kind: "test-worker", label: "Test worker" },
  { pattern: /PandaOS Daemon/, kind: "daemon", label: "PandaOS daemon" },
  { pattern: /gradle|kotlin-compiler/i, kind: "gradle", label: "Gradle/Kotlin" },
  { pattern: /firefox|chromium|chrome/i, kind: "browser", label: "Browser" },
  { pattern: /ollama|llama-server/, kind: "llm-server", label: "Local LLM server" },
];

const ownerRules: Array<{ owner: string; unit: RegExp; folder: RegExp }> = [
  { owner: "9elf26", unit: /9elf26/, folder: /\/9elf26(\/|$)/ },
  { owner: "Chillbro", unit: /chillbro/, folder: /\/chillbro(\/|$)/ },
  { owner: "Kin", unit: /(^|[@-])kin(-|$)/, folder: /\/kin(\/|$)/ },
  { owner: "PandaOS", unit: /pandaos/, folder: /pandaos/ },
  { owner: "Breathe and Pray", unit: /breathe/, folder: /breathe/ },
];

export async function collectReading(now: Date, history: HistoryPoint[]): Promise<HostReading> {
  const [memory, load, processes, listeners, connections] = await Promise.all([
    readMemory(),
    readLoad(),
    readProcesses(),
    readListeners(),
    readConnections(),
  ]);
  const kindOf = new Map(processes.map((process) => [process.pid, classify(process.args).kind]));
  const childrenOf = new Map<number, number[]>();
  for (const process of processes) {
    childrenOf.set(process.ppid, [...(childrenOf.get(process.ppid) ?? []), process.pid]);
  }
  const runsBackend = (pid: number) => {
    const stack = [...(childrenOf.get(pid) ?? [])];
    for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
      if (kindOf.get(current) === "backend-app") return true;
      stack.push(...(childrenOf.get(current) ?? []));
    }
    return false;
  };
  const byPid = new Map(processes.map((process) => [process.pid, process]));
  const protectedPids = new Set<number>([process.pid]);
  for (
    let pid = process.ppid;
    pid > 1 && !protectedPids.has(pid);
    pid = byPid.get(pid)?.ppid ?? 0
  ) {
    protectedPids.add(pid);
  }
  const ownUnit = await unitOf(process.pid);
  const ownHome = process.env.PASEO_HOME ?? null;
  const stopTargets = new Map<number, StopTarget>();
  const sizable = processes.filter((process) => process.rssKb >= MIN_PROCESS_KB);
  const measured = await Promise.all(
    sizable.map(async (process) => {
      const [unit, cwd, processMemory, environment] = await Promise.all([
        unitOf(process.pid),
        cwdOf(process.pid),
        memoryKbOf(process.pid, process.rssKb),
        environmentOf(process.pid),
      ]);
      const { agentId, home } = environment;
      const { kind, label } = classify(process.args);
      const parent = byPid.get(process.ppid);
      const stoppable =
        STOPPABLE_KINDS.has(kind) &&
        !protectedPids.has(process.pid) &&
        !(kind === "daemon" && (home === null || home === ownHome));
      if (stoppable) {
        stopTargets.set(
          process.pid,
          unit !== null && unit !== ownUnit && kind !== "daemon"
            ? { type: "unit", unit }
            : {
                type: "pid",
                pid:
                  kind === "daemon" && parent && /Paseo Supervisor/.test(parent.args)
                    ? parent.pid
                    : process.pid,
              },
        );
      }
      const consumer: HostConsumer = {
        pid: process.pid,
        kind,
        label,
        owner: ownerOf(unit, cwd),
        gb: round2(processMemory.pssKb / KB_PER_GB),
        freeOnStopGb: round2(processMemory.privateDirtyKb / KB_PER_GB),
        unit,
        folder: shortFolder(cwd),
        ports: [...new Set(listeners.get(process.pid) ?? [])].map((port) => ({
          port,
          connections: connections.get(port) ?? 0,
        })),
        ageMinutes: Math.round(process.ageSec / 60),
        stoppable,
        home: kind === "daemon" ? shortFolder(home) : null,
      };
      return { consumer, agentId };
    }),
  );
  const rows = measured.map((item) => item.consumer);
  rows.sort((left, right) => right.gb - left.gb);
  const orphanWatchers = rows.filter((row) => row.kind === "nest-watch" && !runsBackend(row.pid));
  const shown = rows.filter((row, index) => index < CONSUMER_LIMIT || row.stoppable);
  return {
    takenAt: now.toISOString(),
    memory: {
      totalGb: round2(memory.totalGb),
      availableGb: round2(memory.availableGb),
      usedGb: round2(memory.usedGb),
      swapTotalGb: round2(memory.swapTotalGb),
      swapUsedGb: round2(memory.swapUsedGb),
    },
    load: {
      one: round2(load.one),
      five: round2(load.five),
      fifteen: round2(load.fifteen),
      cpus: load.cpus,
    },
    narrative: narrate({ memory, rows, orphanWatchers, history, now }),
    stopTargets,
    owners: ownerTotals(rows),
    consumers: shown,
    profiles: startProfiles.map((profile) => ({
      id: profile.id,
      label: profile.label,
      expectedGb: profile.expectedGb,
      peakGb: profile.peakGb,
      freeAfterGb: round2(memory.availableGb - profile.expectedGb),
      freeAtPeakGb: round2(memory.availableGb - profile.peakGb),
      verdict: verdictFor(memory.totalGb, memory.availableGb, profile.expectedGb, profile.peakGb),
    })),
    footprints: agentFootprints(measured),
  };
}

async function readMemory() {
  const text = await readFile("/proc/meminfo", "utf8");
  const kb = (name: string) => {
    const match = new RegExp(`^${name}:\\s+(\\d+)`, "m").exec(text);
    if (!match) throw new Error(`/proc/meminfo has no ${name}`);
    return Number(match[1]);
  };
  const totalKb = kb("MemTotal");
  const availableKb = kb("MemAvailable");
  const swapTotalKb = kb("SwapTotal");
  const swapFreeKb = kb("SwapFree");
  return {
    totalGb: totalKb / KB_PER_GB,
    availableGb: availableKb / KB_PER_GB,
    usedGb: (totalKb - availableKb) / KB_PER_GB,
    swapTotalGb: swapTotalKb / KB_PER_GB,
    swapUsedGb: (swapTotalKb - swapFreeKb) / KB_PER_GB,
  };
}

async function readLoad() {
  const fields = (await readFile("/proc/loadavg", "utf8")).trim().split(/\s+/);
  return {
    one: Number(fields[0]),
    five: Number(fields[1]),
    fifteen: Number(fields[2]),
    cpus: cpus().length,
  };
}

async function readProcesses(): Promise<ProcessRow[]> {
  const { stdout } = await execFileAsync("ps", ["-eww", "-o", "pid=,ppid=,rss=,etimes=,args="]);
  return stdout.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!match) return [];
    return [
      {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        rssKb: Number(match[3]),
        ageSec: Number(match[4]),
        args: match[5] ?? "",
      },
    ];
  });
}

async function readListeners(): Promise<Map<number, number[]>> {
  const { stdout } = await execFileAsync("ss", ["-H", "-ltnp"]);
  const listeners = new Map<number, number[]>();
  for (const line of stdout.split("\n")) {
    const local = line.trim().split(/\s+/)[3];
    const port = Number(local?.split(":").pop());
    if (!Number.isInteger(port)) continue;
    for (const match of line.matchAll(/pid=(\d+)/g)) {
      const pid = Number(match[1]);
      listeners.set(pid, [...(listeners.get(pid) ?? []), port]);
    }
  }
  return listeners;
}

async function readConnections(): Promise<Map<number, number>> {
  const { stdout } = await execFileAsync("ss", ["-H", "-tn", "state", "established"]);
  const connections = new Map<number, number>();
  for (const line of stdout.split("\n")) {
    const local = line
      .trim()
      .split(/\s+/)
      .find((field) => field.includes(":"));
    const port = Number(local?.split(":").pop());
    if (!Number.isInteger(port)) continue;
    connections.set(port, (connections.get(port) ?? 0) + 1);
  }
  return connections;
}

async function unitOf(pid: number): Promise<string | null> {
  const text = await readFile(`/proc/${pid}/cgroup`, "utf8").catch(() => "");
  return /([^/\s]+\.service)\s*$/m.exec(text)?.[1] ?? null;
}

async function cwdOf(pid: number): Promise<string | null> {
  return readlink(`/proc/${pid}/cwd`).catch(() => null);
}

async function environmentOf(
  pid: number,
): Promise<{ agentId: string | null; home: string | null }> {
  const environ = await readFile(`/proc/${pid}/environ`).catch(() => null);
  const entries = environ?.toString("latin1").split("\0") ?? [];
  const value = (key: string) => {
    const entry = entries.find((item) => item.startsWith(key));
    return entry ? entry.slice(key.length) : null;
  };
  return { agentId: value(AGENT_ID_KEY), home: value(HOME_KEY) };
}

function agentFootprints(
  measured: { consumer: HostConsumer; agentId: string | null }[],
): AgentFootprint[] {
  const totals = new Map<string, AgentFootprint>();
  for (const { consumer, agentId } of measured) {
    if (!agentId) continue;
    const total = totals.get(agentId) ?? {
      agentId,
      processes: 0,
      gb: 0,
      unit: null,
      folder: null,
    };
    totals.set(agentId, {
      agentId,
      processes: total.processes + 1,
      gb: round2(total.gb + consumer.gb),
      unit: total.unit ?? consumer.unit,
      folder: total.folder ?? consumer.folder,
    });
  }
  return [...totals.values()];
}

async function memoryKbOf(
  pid: number,
  rssKb: number,
): Promise<{ pssKb: number; privateDirtyKb: number }> {
  const text = await readFile(`/proc/${pid}/smaps_rollup`, "utf8").catch(() => "");
  const pss = /^Pss:\s+(\d+)\s+kB/m.exec(text);
  const dirty = /^Private_Dirty:\s+(\d+)\s+kB/m.exec(text);
  return {
    pssKb: pss ? Number(pss[1]) : rssKb,
    privateDirtyKb: dirty ? Number(dirty[1]) : rssKb,
  };
}

function classify(args: string): { kind: string; label: string } {
  const rule = kindRules.find(({ pattern }) => pattern.test(args));
  if (rule?.kind === "emulator") {
    const avd = /-avd\s+(\S+)/.exec(args)?.[1];
    return { kind: rule.kind, label: avd ? `Emulator ${avd}` : rule.label };
  }
  if (rule) return { kind: rule.kind, label: rule.label };
  const executable = basename(args.split(/\s+/)[0] ?? "");
  return { kind: "other", label: executable || "process" };
}

function ownerOf(unit: string | null, cwd: string | null): string {
  const byUnit = unit ? ownerRules.find((rule) => rule.unit.test(unit)) : undefined;
  if (byUnit) return byUnit.owner;
  const byFolder = cwd ? ownerRules.find((rule) => rule.folder.test(cwd)) : undefined;
  return byFolder?.owner ?? "Other";
}

export function shortFolder(cwd: string | null): string | null {
  if (!cwd) return null;
  const parts = cwd.split("/").filter(Boolean);
  return parts.length <= 3 ? cwd : `.../${parts.slice(-3).join("/")}`;
}

function ownerTotals(rows: HostConsumer[]): HostSnapshot["owners"] {
  const totals = new Map<string, { gb: number; processes: number }>();
  for (const row of rows) {
    const total = totals.get(row.owner) ?? { gb: 0, processes: 0 };
    totals.set(row.owner, { gb: total.gb + row.gb, processes: total.processes + 1 });
  }
  return [...totals]
    .map(([owner, total]) => ({ owner, gb: round2(total.gb), processes: total.processes }))
    .sort((left, right) => right.gb - left.gb)
    .slice(0, OWNER_LIMIT);
}

function narrate(input: {
  memory: MemoryReading;
  rows: HostConsumer[];
  orphanWatchers: HostConsumer[];
  history: HistoryPoint[];
  now: Date;
}): string[] {
  const { memory, rows, orphanWatchers, history, now } = input;
  const lines = [
    `${memory.availableGb.toFixed(1)} GB of ${memory.totalGb.toFixed(1)} GB available.`,
  ];
  const earlier = history.find((point) => now.getTime() - Date.parse(point.at) <= TREND_WINDOW_MS);
  if (earlier && Math.abs(earlier.availableGb - memory.availableGb) >= 1) {
    const minutes = Math.round((now.getTime() - Date.parse(earlier.at)) / 60000);
    lines.push(`${earlier.availableGb.toFixed(1)} GB were available ${minutes} minutes ago.`);
  }
  if (memory.availableGb < Math.min(8, memory.totalGb * 0.128)) {
    lines.push("Pressure: little RAM available. Do not start heavy tasks.");
  }
  if (memory.swapTotalGb > 0 && memory.swapUsedGb >= memory.swapTotalGb * 0.95) {
    lines.push(
      memory.availableGb >= 16
        ? "Swap is full, but enough RAM is free: no acute pressure."
        : "Swap is full and RAM is short: acute pressure.",
    );
  }
  const largest = rows[0];
  if (largest) {
    lines.push(
      `Largest consumer: ${largest.label} (${largest.owner}), ${largest.gb.toFixed(1)} GB.`,
    );
  }
  const extraDaemons = rows.filter((row) => row.kind === "daemon" && row.stoppable);
  if (extraDaemons.length > 0) {
    const names = extraDaemons
      .slice(0, 3)
      .map((row) => `${row.home ?? `PID ${row.pid}`} (${formatHours(row.ageMinutes)})`);
    lines.push(
      `${extraDaemons.length} extra daemon(s) besides this one: ${names.join("; ")}. Stop them in Who uses the RAM when their agent is done.`,
    );
  }
  const emulators = rows.filter((row) => row.kind === "emulator");
  if (emulators.length > 0) {
    const total = emulators.reduce((sum, row) => sum + row.gb, 0);
    lines.push(`${emulators.length} emulator(s) use ${total.toFixed(1)} GB.`);
  }
  const idle = rows.filter(
    (row) =>
      IDLE_KINDS.has(row.kind) &&
      row.ports.length > 0 &&
      row.ports.every((port) => port.connections === 0),
  );
  if (idle.length > 0) {
    const names = idle
      .slice(0, 3)
      .map((row) => `${row.label} on port ${row.ports.map((port) => port.port).join(", ")}`);
    lines.push(`No connections: ${names.join("; ")}.`);
  }
  if (orphanWatchers.length > 0) {
    const names = orphanWatchers.slice(0, 3).map((row) => `${row.label} (PID ${row.pid})`);
    lines.push(`Watchers without a running backend: ${names.join("; ")}.`);
  }
  const stoppable = rows.filter((row) => orphanWatchers.includes(row) || idle.includes(row));
  const freeOnStop = stoppable.reduce((sum, row) => sum + row.freeOnStopGb, 0);
  if (freeOnStop >= 0.3) {
    lines.push(
      `Stopping the items without connections or backend would free about ${freeOnStop.toFixed(1)} GB.`,
    );
  }
  const old = rows.filter((row) => row.ageMinutes >= 24 * 60 && row.gb >= 0.5);
  if (old.length > 0) {
    const names = old
      .slice(0, 3)
      .map((row) => `${row.label} (${row.owner}, ${Math.round(row.ageMinutes / 60)} h)`);
    lines.push(`Running for over a day, 0.5 GB or more: ${names.join("; ")}.`);
  }
  return lines;
}

function formatHours(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
