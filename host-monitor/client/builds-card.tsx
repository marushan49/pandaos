import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { HostBuildJob } from "../shared/host";
import { useHostBuilds } from "./use-host";

type Colors = PluginScreenProps["theme"]["colors"];

function duration(seconds: number | null) {
  if (seconds === null) return "";
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return `${whole} s`;
  const minutes = Math.floor(whole / 60);
  if (minutes < 60) return `${minutes}:${String(whole % 60).padStart(2, "0")} min`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")} h`;
}

export function statusLine(job: HostBuildJob) {
  if (job.state === "running") {
    const memory =
      job.memoryGb !== null && job.memoryGb >= 0.1 ? `, ${job.memoryGb.toFixed(1)} GB` : "";
    return `Running on ${job.worker}, ${duration(job.seconds)}${memory}`;
  }
  if (job.state === "queued")
    return `Waiting ${duration(job.waited)}: ${job.reason ?? "checking capacity"}`;
  if (job.exit === 0) return `Done on ${job.worker} in ${duration(job.seconds)}`;
  if (job.exit === 130) return "Canceled";
  return `Failed on ${job.worker} (exit ${job.exit ?? "?"})${job.reason ? `: ${job.reason}` : ""}`;
}

export function summaryLine(running: number, queued: number) {
  if (!running && !queued) return "No active builds";
  return [running ? `${running} running` : null, queued ? `${queued} waiting` : null]
    .filter(Boolean)
    .join(", ");
}

function createStyles(colors: Colors) {
  return {
    card: { padding: 14, borderRadius: 10, gap: 10, backgroundColor: colors.surface1 },
    header: { flexDirection: "row" as const, justifyContent: "space-between" as const, gap: 12 },
    title: { color: colors.foreground, fontSize: 15, fontWeight: "600" as const },
    summary: { color: colors.foregroundMuted, fontSize: 13 },
    workers: { color: colors.foregroundMuted, fontSize: 13 },
    row: { gap: 2, paddingVertical: 4 },
    name: { color: colors.foreground, fontSize: 14 },
    muted: { color: colors.foregroundMuted, fontSize: 13 },
    running: { color: colors.accent, fontSize: 13 },
    failed: { color: colors.statusDanger, fontSize: 13 },
    detail: { color: colors.foregroundMuted, fontSize: 12 },
    error: { color: colors.statusDanger, fontSize: 14 },
  };
}

type Styles = ReturnType<typeof createStyles>;

function lineStyle(job: HostBuildJob, styles: Styles) {
  if (job.state === "running") return styles.running;
  if (job.state === "finished" && job.exit !== 0 && job.exit !== 130) return styles.failed;
  return styles.muted;
}

interface RowProps {
  job: HostBuildJob;
  expanded: boolean;
  styles: Styles;
  onToggle: (id: string) => void;
}

const BuildRow = memo(function BuildRow({ job, expanded, styles, onToggle }: RowProps) {
  const onPress = useCallback(() => onToggle(job.id), [onToggle, job.id]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${job.product}, ${job.task}, ${statusLine(job)}`}
      onPress={onPress}
      style={styles.row}
    >
      <Text style={styles.name} numberOfLines={1}>
        {`${job.product} · ${job.task}`}
      </Text>
      <Text style={lineStyle(job, styles)} numberOfLines={expanded ? undefined : 2}>
        {statusLine(job)}
      </Text>
      {expanded ? (
        <View>
          <Text style={styles.detail}>
            {`#${job.sequence}${job.worktree ? `, worktree ${job.worktree}` : ""}`}
          </Text>
          {job.placement ? <Text style={styles.detail}>{job.placement}</Text> : null}
          {job.artifacts.map((path) => (
            <Text key={path} style={styles.detail} selectable>
              {path}
            </Text>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
});

export function BuildsCard({ colors }: { colors: Colors }) {
  const { data, error } = useHostBuilds();
  const [open, setOpen] = useState<string | null>(null);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const toggle = useCallback(
    (id: string) => setOpen((current) => (current === id ? null : id)),
    [],
  );
  const workers = useMemo(
    () => (data?.workers ?? []).map((worker) => `${worker.name}: ${worker.detail}`).join(" · "),
    [data],
  );
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Builds</Text>
        <Text style={styles.summary}>
          {data?.available ? summaryLine(data.running, data.queued) : ""}
        </Text>
      </View>
      {error || (data && !data.available) ? (
        <Text
          style={styles.error}
        >{`Build scheduler unavailable: ${error?.message ?? data?.error ?? ""}`}</Text>
      ) : null}
      {workers ? <Text style={styles.workers}>{workers}</Text> : null}
      {(data?.jobs ?? []).map((job) => (
        <BuildRow
          key={job.id}
          job={job}
          expanded={open === job.id}
          styles={styles}
          onToggle={toggle}
        />
      ))}
    </View>
  );
}
