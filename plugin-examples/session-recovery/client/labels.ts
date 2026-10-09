import type { z } from "zod";
import type { RecoveryCandidate, RecoveryEventSchema, listRecovery } from "../shared/contracts";
import type { Colors } from "./styles";

export type RecoveryEvent = z.infer<typeof RecoveryEventSchema>;
export type RecoveryList = z.output<typeof listRecovery.output>;
export type Tone = "success" | "danger" | "warning" | "muted";

export interface EventPresentation {
  title: string;
  icon: string;
  tone: Tone;
}

export function describeEvent(event: RecoveryEvent): EventPresentation {
  const automatic = event.mode === "automatic";
  switch (event.status) {
    case "resumed":
      return {
        title: automatic ? "Automatisch fortgesetzt" : "Manuell fortgesetzt",
        icon: automatic ? "Play" : "CircleCheck",
        tone: "success",
      };
    case "failed":
      return {
        title: automatic ? "Automatisches Fortsetzen fehlgeschlagen" : "Fortsetzen fehlgeschlagen",
        icon: "TriangleAlert",
        tone: "danger",
      };
    case "blocked":
      return { title: "Fortsetzen blockiert", icon: "Ban", tone: "warning" };
    default:
      return {
        title: automatic ? "Automatisches Fortsetzen läuft" : "Fortsetzen läuft",
        icon: "Clock",
        tone: "muted",
      };
  }
}

export function firstLine(text: string): string {
  return text.split("\n", 1)[0] ?? "";
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function toneColor(colors: Colors, tone: Tone): string {
  if (tone === "success") return colors.statusSuccess;
  if (tone === "danger") return colors.statusDanger;
  if (tone === "warning") return colors.statusWarning;
  return colors.foregroundMuted;
}

export function eventDetail(event: RecoveryEvent): string {
  return firstLine(event.status === "failed" && event.error ? event.error : event.reason);
}

export interface AutomaticState {
  enabled: boolean;
  maxAttempts: number;
}

export function caseState(
  record: RecoveryCandidate,
  automatic: AutomaticState,
): { icon: string; text: string; tone: "warning" | "muted" } {
  if (!record.canResume) {
    return {
      icon: "Ban",
      text: record.blockedReason ?? "Fortsetzen derzeit nicht möglich",
      tone: "warning",
    };
  }
  if (!automatic.enabled) {
    return { icon: "Play", text: "Wartet auf manuelles Fortsetzen", tone: "muted" };
  }
  if (record.autoAttempts >= automatic.maxAttempts) {
    return {
      icon: "Play",
      text: `${record.autoAttempts} von ${automatic.maxAttempts} automatischen Versuchen genutzt, jetzt manuell fortsetzen`,
      tone: "warning",
    };
  }
  if (!record.autoEligible) {
    return { icon: "Pause", text: "Automatik pausiert, manuell fortsetzbar", tone: "muted" };
  }
  return { icon: "Clock", text: "Wird automatisch fortgesetzt", tone: "muted" };
}

export function describeStatus(data: RecoveryList | undefined): {
  icon: string;
  tone: Tone;
  title: string;
  line: string;
} {
  if (!data) {
    return {
      icon: "ShieldCheck",
      tone: "success",
      title: "Prüfe Sessions",
      line: "Verbindung zum Host wird geprüft",
    };
  }
  const open = data.candidates.length;
  const waiting = data.automatic.enabled ? data.automatic.waiting : 0;
  const base = `${data.tracked} laufende Sessions abgesichert, zuletzt geprüft ${formatTime(data.checkedAt)}`;
  return {
    icon: open > 0 ? "TriangleAlert" : "ShieldCheck",
    tone: open > 0 ? "warning" : "success",
    title: open === 0 ? "Alles läuft" : `${open} unterbrochen`,
    line: waiting > 0 ? `${base}, ${waiting} werden automatisch fortgesetzt` : base,
  };
}

export function automaticHint(automatic: AutomaticState | undefined): string {
  return automatic
    ? `Bis zu ${automatic.maxAttempts} Versuche je Unterbrechung, danach manuell`
    : "Sessions nach einer Unterbrechung selbst weiterarbeiten lassen";
}
