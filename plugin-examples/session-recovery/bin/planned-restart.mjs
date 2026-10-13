#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  symlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    release: { type: "string" },
    "live-link": { type: "string", default: join(homedir(), "projects/pandaos-live") },
    service: { type: "string", default: "pandaos.service" },
    home: { type: "string", default: join(homedir(), ".pandaos") },
    "timeout-sec": { type: "string", default: "180" },
    "active-minutes": { type: "string", default: "15" },
    "run-id": { type: "string" },
    foreground: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

const runId = values["run-id"] ?? new Date().toISOString().replace(/[:.]/g, "-");
const logDirectory = join(values.home, "planned-restart");
mkdirSync(logDirectory, { recursive: true });
const logFile = join(logDirectory, `${runId}.log`);
const say = (message) => {
  const line = `${new Date().toISOString()} ${message}`;
  appendFileSync(logFile, `${line}\n`);
  console.log(line);
};

if (values["dry-run"]) {
  for (const key of ["PASEO_HOME", "PANDAOS_HOME", "PASEO_HOST", "PASEO_AGENT_ID"])
    delete process.env[key];
  const live = realpathSync(values["live-link"]);
  const { connectToDaemon } = await import(join(live, "packages/cli/dist/utils/client.js"));
  const client = await connectToDaemon({ target: { kind: "instance", home: values.home } });
  try {
    const run = await client.invokePluginRpc(
      "session-recovery",
      "session-recovery.restart.prepare",
      {
        runId,
        activeWithinMinutes: Number(values["active-minutes"]),
        dryRun: true,
      },
    );
    console.log(`Würde ${run.entries.length} Sessions vor dem Neustart fragen:`);
    for (const entry of run.entries)
      console.log(`  ${entry.agentId.slice(0, 8)} ${entry.title ?? ""}`);
  } finally {
    await client.close().catch(() => undefined);
  }
  process.exit(0);
}

if (!values.foreground) {
  const args = [process.argv[1], "--foreground", "--run-id", runId];
  for (const key of ["release", "live-link", "service", "home", "timeout-sec", "active-minutes"])
    if (values[key] !== undefined) args.push(`--${key}`, String(values[key]));
  const unit = `pandaos-planned-restart-${runId.toLowerCase().replace(/[^a-z0-9-]/g, "")}`;
  const result = spawnSync(
    "systemd-run",
    ["--user", `--unit=${unit}`, `--setenv=PATH=${process.env.PATH}`, process.execPath, ...args],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
  console.log(`Geplanter Neustart läuft als ${unit}. Log: ${logFile}`);
  console.log("Beende jetzt deinen Zug, damit du den Hinweis vor dem Neustart beantworten kannst.");
  process.exit(0);
}

for (const key of ["PASEO_HOME", "PANDAOS_HOME", "PASEO_HOST", "PASEO_AGENT_ID"])
  delete process.env[key];
const liveLink = values["live-link"];
const oldRelease = realpathSync(liveLink);
const { connectToDaemon } = await import(join(oldRelease, "packages/cli/dist/utils/client.js"));
const target = { kind: "instance", home: values.home };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function rpc(method, input) {
  const client = await connectToDaemon({ target });
  try {
    return await client.invokePluginRpc("session-recovery", method, input);
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function status() {
  const response = await fetch(`http://127.0.0.1:${daemonPort()}/api/status`, {
    signal: AbortSignal.timeout(3000),
  });
  return response.json();
}

function daemonPort() {
  const config = JSON.parse(readFileSync(join(values.home, "config.json"), "utf8"));
  const listen = config.daemon?.listen ?? "127.0.0.1:6767";
  return String(listen).split(":").pop();
}

function systemctl(...args) {
  const result = spawnSync("systemctl", ["--user", ...args], { encoding: "utf8", timeout: 60_000 });
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}`.trim() };
}

function point(release) {
  const temporary = `${liveLink}.planned-restart-switch`;
  if (existsSync(temporary)) spawnSync("rm", ["-f", temporary]);
  symlinkSync(release, temporary);
  renameSync(temporary, liveLink);
}

function expectedBundle(release) {
  const index = join(release, "packages/server/dist/server/web-ui/index.html");
  if (!existsSync(index)) return null;
  return /index-[0-9a-f]+\.js/.exec(readFileSync(index, "utf8"))?.[0] ?? null;
}

async function healthy(serverId, bundle) {
  for (let attempt = 0; attempt < 40; attempt++) {
    await sleep(3000);
    if (systemctl("is-active", values.service).output !== "active") continue;
    try {
      const current = await status();
      if (current.serverId !== serverId) continue;
      if (bundle) {
        const html = await (await fetch(`http://127.0.0.1:${daemonPort()}/`)).text();
        if (!html.includes(bundle)) continue;
      }
      return true;
    } catch {}
  }
  return false;
}

say(
  `Lauf ${runId}: alter Stand ${oldRelease}${values.release ? `, Ziel ${resolve(values.release)}` : ""}`,
);
const before = await status();
const release = values.release ? realpathSync(values.release) : null;
if (release && !existsSync(join(release, "packages/cli/bin/pandaos"))) {
  say(`Abbruch: ${release} ist kein vollständiger Release.`);
  process.exit(1);
}

const timeoutMs = Number(values["timeout-sec"]) * 1000;
let run = await rpc("session-recovery.restart.prepare", {
  runId,
  timeoutMs,
  activeWithinMinutes: Number(values["active-minutes"]),
});
say(`Hinweis an ${run.entries.length} Sessions gesendet.`);
const deadline = Date.now() + timeoutMs + 30_000;
while (!run.done && Date.now() < deadline) {
  await sleep(5000);
  run = await rpc("session-recovery.restart.status", { runId, phase: "prepare" });
}
for (const entry of run.entries)
  say(
    `  ${entry.result.padEnd(9)} ${entry.agentId.slice(0, 8)} ${entry.title ?? ""} ${entry.detail}`,
  );
if (!run.done)
  say(
    "Nicht alle Sessions haben rechtzeitig geantwortet; sie laufen über die normale Unterbrechungs-Erkennung.",
  );

if (release) point(release);
const restart = systemctl("restart", values.service);
say(`Neustart ${values.service}: ${restart.ok ? "ausgelöst" : restart.output}`);
const bundle = expectedBundle(release ?? oldRelease);
if (!restart.ok || !(await healthy(before.serverId, bundle))) {
  say("Daemon nicht gesund.");
  if (release) {
    say(`Rollback auf ${oldRelease}.`);
    point(oldRelease);
    systemctl("restart", values.service);
    say(
      (await healthy(before.serverId, expectedBundle(oldRelease)))
        ? "Rollback gesund."
        : "Rollback ebenfalls nicht gesund, bitte prüfen.",
    );
  }
}
say(`Daemon läuft auf ${realpathSync(liveLink)}.`);

let resumed = null;
for (let attempt = 0; attempt < 24 && !resumed; attempt++) {
  try {
    resumed = await rpc("session-recovery.restart.resume", { runId });
  } catch (error) {
    if (attempt === 23)
      say(`Fortsetzen fehlgeschlagen: ${error instanceof Error ? error.message : error}`);
    await sleep(5000);
  }
}
const resumeDeadline = Date.now() + 300_000;
while (resumed && !resumed.done && Date.now() < resumeDeadline) {
  await sleep(3000);
  resumed = await rpc("session-recovery.restart.status", { runId, phase: "resume" }).catch(
    () => resumed,
  );
}
for (const entry of resumed?.entries ?? [])
  say(
    `  ${entry.result.padEnd(9)} ${entry.agentId.slice(0, 8)} ${entry.title ?? ""} ${entry.detail}`,
  );
say("Fertig.");
process.exit(0);
