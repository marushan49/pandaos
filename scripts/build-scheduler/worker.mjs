import os from "node:os";
import { spawn, execFileSync } from "node:child_process";
import readline from "node:readline";

function send(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

if (process.argv[1] === "probe") {
  let available = os.freemem();
  if (process.platform === "darwin") {
    const text = execFileSync("/usr/bin/vm_stat", { encoding: "utf8", timeout: 2000 });
    const page = Number(text.match(/page size of (\d+) bytes/)[1]);
    available = ["free", "inactive", "speculative"].reduce((total, name) => {
      const match = text.match(new RegExp(`Pages ${name}:\\s+(\\d+)`));
      return total + Number(match?.[1] ?? 0) * page;
    }, 0);
  }
  send({
    platform: process.platform,
    available_memory: available,
    total_memory: os.totalmem(),
    cores: os.availableParallelism(),
    load: os.loadavg()[0],
    node: process.version,
  });
} else {
  const input = readline.createInterface({ input: process.stdin });
  let child;
  let payload;
  let ended = false;
  let stopping = false;
  let reason;
  let exitOverride;
  let lastLease = Date.now();
  let started;
  let peak = 0;
  const cpu = new Map();

  function killGroup(sig) {
    if (!child?.pid) return;
    try {
      process.kill(-child.pid, sig);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }

  function stop(code, why) {
    if (stopping || ended) return;
    stopping = true;
    exitOverride = code;
    reason = why;
    killGroup("SIGTERM");
    setTimeout(() => killGroup("SIGKILL"), 1000).unref();
  }

  function finish(code) {
    if (ended) return;
    ended = true;
    killGroup("SIGKILL");
    send({
      event: "result",
      exit: exitOverride ?? code,
      reason,
      peak_memory: peak,
      cpu_seconds: [...cpu.values()].reduce((a, b) => a + b, 0),
      wall: (Date.now() - started) / 1000,
      measurement: "sampled-process-group",
    });
    input.close();
    process.stdin.destroy();
    clearInterval(timer);
  }

  function sample() {
    if (!child?.pid || ended) return;
    if (Date.now() - lastLease > 10000) stop(125, "worker lease expired");
    if (Date.now() - started > payload.timeout * 1000) stop(124, "runtime limit");
    let memory = 0;
    try {
      const rows = execFileSync("/bin/ps", ["-axo", "pid=,pgid=,rss=,time="], {
        encoding: "utf8",
        timeout: 2000,
        maxBuffer: 8 * 1024 * 1024,
      });
      for (const row of rows.trim().split("\n")) {
        const [pid, group, rss, time] = row.trim().split(/\s+/);
        if (Number(group) !== child.pid) continue;
        memory += Number(rss) * 1024;
        const parts = time.split(":").map(Number);
        cpu.set(
          pid,
          Math.max(
            cpu.get(pid) ?? 0,
            parts.reduce((n, part) => n * 60 + part, 0),
          ),
        );
      }
      peak = Math.max(peak, memory);
      if (memory > payload.memory_max) stop(137, "worker memory limit");
      send({
        event: "usage",
        memory,
        peak_memory: peak,
        cpu_seconds: [...cpu.values()].reduce((a, b) => a + b, 0),
        time: Date.now() / 1000,
      });
    } catch {
      stop(125, "worker resource sampling failed");
    }
  }

  const timer = setInterval(sample, 1000);
  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(sig, () => stop(130, "canceled"));
  process.stdout.on("error", () => stop(125, "worker output closed"));
  input.on("close", () => stop(130, "worker transport closed"));
  input.on("line", (line) => {
    lastLease = Date.now();
    if (payload) return;
    try {
      payload = JSON.parse(line);
      if (
        !Array.isArray(payload.command) ||
        !payload.command.length ||
        payload.command.some((arg) => typeof arg !== "string" || arg.includes("\0")) ||
        typeof payload.cwd !== "string" ||
        !payload.cwd.startsWith("/") ||
        !Number.isFinite(payload.timeout) ||
        payload.timeout < 1 ||
        payload.timeout > 7200 ||
        !Number.isFinite(payload.memory_max) ||
        payload.memory_max <= 0 ||
        !payload.env ||
        typeof payload.env !== "object" ||
        Array.isArray(payload.env) ||
        Object.entries(payload.env).some(
          ([key, value]) =>
            !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ||
            typeof value !== "string" ||
            value.includes("\0"),
        )
      )
        throw new Error("invalid worker request");
      started = Date.now();
      child = spawn(payload.command[0], payload.command.slice(1), {
        cwd: payload.cwd,
        env: { ...process.env, ...payload.env },
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      for (const name of ["stdout", "stderr"])
        child[name].on("data", (data) => {
          if (
            !process.stdout.write(
              `${JSON.stringify({ event: name, data: data.toString("base64") })}\n`,
            )
          ) {
            child[name].pause();
            process.stdout.once("drain", () => child[name].resume());
          }
        });
      child.on("error", (error) => finish(error.code === "ENOENT" ? 127 : 126));
      child.on("close", (code, sig) => finish(code ?? 128 + (os.constants.signals[sig] ?? 0)));
    } catch {
      started = Date.now();
      reason = "invalid worker request";
      finish(125);
    }
  });
  setTimeout(() => {
    if (!payload) {
      started = Date.now();
      finish(125);
    }
  }, 5000).unref();
}
