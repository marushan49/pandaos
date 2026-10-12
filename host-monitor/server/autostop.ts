import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { HostConsumer } from "../shared/host";
import type { StopTarget } from "./collect";

const execFileAsync = promisify(execFile);
const ACUTE_AVAILABLE_GB = 5;
const ACUTE_SWAP_SHARE = 0.95;
const IDLE_STOP_MINUTES = 30;
const DATA_DIR = join(homedir(), ".pandaos", "host-monitor");
const STOP_LOG_PATH = join(DATA_DIR, "stopped.log");
const AUTOSTOP_OFF_PATH = join(DATA_DIR, "autostop-off");

export interface Pressure {
  availableGb: number;
  swapUsedGb: number;
  swapTotalGb: number;
}

export interface IdleStop {
  unit: string;
  label: string;
  idleMinutes: number;
  availableGb: number;
}

export function autoStopEnabled(): boolean {
  return !existsSync(AUTOSTOP_OFF_PATH);
}

export function isAcutePressure(pressure: Pressure): boolean {
  return (
    pressure.availableGb < ACUTE_AVAILABLE_GB &&
    pressure.swapTotalGb > 0 &&
    pressure.swapUsedGb >= pressure.swapTotalGb * ACUTE_SWAP_SHARE
  );
}

export function isIdleStopCandidate(
  consumer: Pick<HostConsumer, "kind" | "unit" | "ports">,
  idleMinutes: number,
  pressure: Pressure,
): boolean {
  return (
    consumer.kind === "emulator" &&
    consumer.unit !== null &&
    consumer.ports.length > 0 &&
    consumer.ports.every((port) => port.connections === 0) &&
    idleMinutes >= IDLE_STOP_MINUTES &&
    isAcutePressure(pressure)
  );
}

export async function stopIdleEmulator(stop: IdleStop): Promise<string> {
  const result = await stopTarget({ type: "unit", unit: stop.unit }, { reason: "idle", ...stop });
  return result.stopped
    ? `${stop.label} stopped after ${stop.idleMinutes} min without ADB, with ${stop.availableGb.toFixed(1)} GB free and swap full.`
    : `${stop.label} was not stopped: ${result.message}`;
}

export async function stopTarget(
  target: StopTarget,
  record: Record<string, unknown>,
): Promise<{ stopped: boolean; message: string }> {
  await mkdir(DATA_DIR, { recursive: true });
  const entry = { at: new Date().toISOString(), target, ...record };
  try {
    if (target.type === "unit") {
      await execFileAsync("systemctl", ["--user", "stop", target.unit], { timeout: 60_000 });
    } else {
      process.kill(target.pid, "SIGTERM");
    }
    await appendFile(STOP_LOG_PATH, `${JSON.stringify({ ...entry, result: "stopped" })}\n`);
    return { stopped: true, message: "Stopped." };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await appendFile(STOP_LOG_PATH, `${JSON.stringify({ ...entry, result: "failed", message })}\n`);
    return { stopped: false, message };
  }
}
