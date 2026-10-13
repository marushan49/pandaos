const WINDOW_MS = 60 * 60 * 1000;
export const RUN_CAP = 15;

const runs = new Map<string, number[]>();
const lastSeen = new Map<string, { open: number; done: number }>();

export function runsLastHour(key: string, now: number): number {
  return (runs.get(key) ?? []).filter((at) => now - at < WINDOW_MS).length;
}

export function recordRun(key: string, now: number): void {
  runs.set(key, [...(runs.get(key) ?? []).filter((at) => now - at < WINDOW_MS), now]);
}

export function previousSeen(key: string): { open: number; done: number } | undefined {
  return lastSeen.get(key);
}

export function rememberSeen(key: string, progress: { open: number; done: number }): void {
  lastSeen.set(key, { open: progress.open, done: progress.done });
}
