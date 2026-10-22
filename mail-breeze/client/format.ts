import type { BreezeState, Task } from "../shared/contracts";
import { STATUS_ORDER, type TaskStatus } from "./theme";

const MONTHS = [
  "Jan.",
  "Feb.",
  "März",
  "Apr.",
  "Mai",
  "Juni",
  "Juli",
  "Aug.",
  "Sept.",
  "Okt.",
  "Nov.",
  "Dez.",
];

export function relativeTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "noch nie";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return "gerade eben";
  if (seconds < 3600) return `vor ${Math.max(1, Math.round(seconds / 60))} Min.`;
  if (seconds < 86400) return `vor ${Math.round(seconds / 3600)} Std.`;
  const date = new Date(at);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const day = `${date.getDate()}. ${MONTHS[date.getMonth()]}`;
  return sameYear ? day : `${day} ${date.getFullYear()}`;
}

export function clockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getDate()}. ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())} Uhr`;
}

export function snippet(body: string, max = 150): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return "Ruhige Nacht";
  if (hour < 12) return "Guten Morgen";
  if (hour < 18) return "Guten Tag";
  return "Guten Abend";
}

export type FilterKey = "active" | TaskStatus | "all";

export const FILTERS: readonly { key: FilterKey; label: string }[] = [
  { key: "active", label: "Aktiv" },
  { key: "ready", label: "Bereit" },
  { key: "working", label: "In Arbeit" },
  { key: "needs_input", label: "Braucht dich" },
  { key: "done", label: "Erledigt" },
  { key: "failed", label: "Fehlgeschlagen" },
  { key: "dismissed", label: "Verworfen" },
  { key: "all", label: "Alle" },
];

const ACTIVE: ReadonlySet<TaskStatus> = new Set<TaskStatus>(["ready", "working", "needs_input"]);

export function isActive(task: Task): boolean {
  return ACTIVE.has(task.status);
}

export function matchesFilter(task: Task, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "active") return isActive(task);
  return task.status === filter;
}

export function countByFilter(tasks: readonly Task[]): Record<FilterKey, number> {
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, 0])) as Record<FilterKey, number>;
  for (const task of tasks) {
    counts.all += 1;
    counts[task.status] += 1;
    if (isActive(task)) counts.active += 1;
  }
  return counts;
}

export function sortTasks(tasks: readonly Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const byStatus = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    if (byStatus !== 0) return byStatus;
    return Date.parse(b.mail.receivedAt) - Date.parse(a.mail.receivedAt);
  });
}

export function hasDemo(state: BreezeState): boolean {
  return state.tasks.some((task) => task.demo);
}

export function hasRetainedLogin(state: BreezeState): boolean {
  return state.connection.status === "error" && Boolean(state.connection.account);
}

export type Provider = "gmail" | "outlook";
type Connection = BreezeState["connection"];

export function connectionOwner(connection: Connection): Provider | null {
  if (connection.provider) return connection.provider;
  if (connection.status === "disconnected" && !connection.error) return null;
  return "outlook";
}

export function liveProvider(connection: Connection): Provider | null {
  const live =
    connection.status === "connecting" ||
    connection.status === "connected" ||
    (connection.status === "error" && Boolean(connection.account));
  return live ? connectionOwner(connection) : null;
}

export function providerName(connection: Connection): string {
  const owner = connectionOwner(connection);
  if (owner === "gmail") return "Gmail";
  return owner === "outlook" ? "Outlook" : "Postfach";
}

export function untilTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "noch nicht geplant";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  const diff = at - now;
  if (diff < 0) return "fällig";
  if (diff < 15000) return "gleich";
  if (diff < 3600000) return `in ${Math.max(1, Math.round(diff / 60000))} Min.`;
  if (diff < 86400000) return `in ${Math.round(diff / 3600000)} Std.`;
  return relativeTime(iso, now);
}

export function pollInterval(state: BreezeState | undefined): number | false {
  if (!state) return false;
  const busy =
    state.connection.status === "connecting" ||
    state.connection.reader?.status === "reading" ||
    state.tasks.some((task) => task.status === "working");
  if (busy) return 3000;
  return state.connection.status === "connected" || hasRetainedLogin(state) ? 10000 : false;
}

export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/^Request failed:\s*/, "")
    .replace(/\s+requestType=\S+(?:\s+code=\S+)?$/, "")
    .trim();
}
