import type { HostSnapshot } from "../shared/host";
import { autoStopEnabled, isIdleStopCandidate, stopIdleEmulator, stopTarget } from "./autostop";
import { collectReading, type HistoryPoint, type HostReading } from "./collect";

const SAMPLE_INTERVAL_MS = 30_000;
const CACHE_MAX_AGE_MS = 10_000;
const HISTORY_LIMIT = 120;
const STOP_LINES_LIMIT = 3;

export type MonitorSnapshot = HostReading & Pick<HostSnapshot, "history">;

export function startMonitor() {
  const history: HistoryPoint[] = [];
  const idleSince = new Map<string, number>();
  const stopping = new Set<string>();
  const stopLines: string[] = [];
  let latest: MonitorSnapshot | null = null;
  let sampling: Promise<MonitorSnapshot> | null = null;

  async function sample(): Promise<MonitorSnapshot> {
    const reading = await collectReading(new Date(), history);
    history.push({ at: reading.takenAt, availableGb: reading.memory.availableGb });
    if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
    autoStop(reading, Date.now());
    const next: MonitorSnapshot = {
      ...reading,
      narrative: [...reading.narrative, ...stopLines.slice(-STOP_LINES_LIMIT)],
      history: history.map((point) => ({ at: point.at, availableGb: point.availableGb })),
    };
    latest = next;
    return next;
  }

  function trackIdle(consumers: HostReading["consumers"], now: number) {
    const seen = new Set<string>();
    for (const consumer of consumers) {
      if (consumer.kind !== "emulator" || consumer.unit === null) continue;
      seen.add(consumer.unit);
      const idle =
        consumer.ports.length > 0 && consumer.ports.every((port) => port.connections === 0);
      if (!idle) idleSince.delete(consumer.unit);
      else if (!idleSince.has(consumer.unit)) idleSince.set(consumer.unit, now);
    }
    for (const unit of idleSince.keys()) {
      if (!seen.has(unit)) idleSince.delete(unit);
    }
  }

  function autoStop(reading: HostReading, now: number) {
    trackIdle(reading.consumers, now);
    if (!autoStopEnabled()) return;
    for (const consumer of reading.consumers) {
      const unit = consumer.unit;
      const since = unit === null ? undefined : idleSince.get(unit);
      if (unit === null || since === undefined || stopping.has(unit)) continue;
      const idleMinutes = Math.round((now - since) / 60_000);
      if (!isIdleStopCandidate(consumer, idleMinutes, reading.memory)) continue;
      stopping.add(unit);
      void stopIdleEmulator({
        unit,
        label: consumer.label,
        idleMinutes,
        availableGb: reading.memory.availableGb,
      })
        .then((line) => stopLines.push(line))
        .finally(() => {
          stopping.delete(unit);
        });
      return;
    }
  }

  function snapshot(): Promise<MonitorSnapshot> {
    if (latest && Date.now() - Date.parse(latest.takenAt) < CACHE_MAX_AGE_MS) {
      return Promise.resolve(latest);
    }
    sampling ??= sample().finally(() => {
      sampling = null;
    });
    return sampling;
  }

  async function stop(pid: number): Promise<{ stopped: boolean; message: string }> {
    const reading = await snapshot();
    const consumer = reading.consumers.find((item) => item.pid === pid);
    const target = reading.stopTargets.get(pid);
    if (!consumer || !target) {
      return { stopped: false, message: "This process cannot be stopped from here." };
    }
    const result = await stopTarget(target, {
      reason: "user",
      label: consumer.label,
      pid,
      gb: consumer.gb,
      ageMinutes: consumer.ageMinutes,
    });
    latest = null;
    return {
      stopped: result.stopped,
      message: result.stopped
        ? `${consumer.label} stopped, about ${consumer.freeOnStopGb.toFixed(1)} GB freed.`
        : `${consumer.label} was not stopped: ${result.message}`,
    };
  }

  const sampleInBackground = () => {
    snapshot().catch((error: unknown) => console.error("host sampling failed", error));
  };
  sampleInBackground();
  const timer = setInterval(sampleInBackground, SAMPLE_INTERVAL_MS);

  return {
    snapshot,
    stopProcess: stop,
    stop() {
      clearInterval(timer);
    },
  };
}
