import type { BuildJob } from "../shared/status";

export function duration(seconds: number | null) {
  if (seconds === null) return "";
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return `${whole} s`;
  const minutes = Math.floor(whole / 60);
  if (minutes < 60) return `${minutes}:${String(whole % 60).padStart(2, "0")} min`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")} h`;
}

export function workerName(worker: string) {
  if (worker === "local") return "Zotac";
  if (worker === "auto") return "Host offen";
  return worker;
}

export function line(job: BuildJob) {
  if (job.state === "running") {
    const memory = job.memoryGib !== null ? ` · ${job.memoryGib.toFixed(1)} GiB` : "";
    return `läuft auf ${workerName(job.worker)} · ${duration(job.seconds)}${memory}`;
  }
  if (job.state === "queued")
    return `wartet ${duration(job.waited)} · ${job.reason ?? "prüft Kapazität"}`;
  if (job.exit === 0) return `fertig auf ${workerName(job.worker)} · ${duration(job.seconds)}`;
  if (job.exit === 130) return "abgebrochen";
  return `fehlgeschlagen (Exit ${job.exit ?? "?"})${job.reason ? ` · ${job.reason}` : ""}`;
}

export function counts(jobs: BuildJob[]) {
  const running = jobs.filter((job) => job.state === "running").length;
  const queued = jobs.filter((job) => job.state === "queued").length;
  if (!running && !queued) return "Keine aktiven Builds";
  return [running ? `${running} läuft` : null, queued ? `${queued} wartet` : null]
    .filter(Boolean)
    .join(" · ");
}
