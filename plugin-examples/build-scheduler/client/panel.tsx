import { useQuery } from "@tanstack/react-query";
import { type PluginWorkspacePanelProps, useRpc } from "@getpaseo/plugin/client";
import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { type BuildJob, buildStatusRpc } from "../shared/status";
import { counts, line, workerName } from "./format";

type Colors = PluginWorkspacePanelProps["theme"]["colors"];

function createStyles(colors: Colors, compact: boolean) {
  return {
    screen: { flex: 1, backgroundColor: colors.surface0 },
    content: { padding: compact ? 16 : 20, gap: 16 },
    unavailable: { flex: 1, backgroundColor: colors.surface0, padding: compact ? 16 : 20, gap: 8 },
    summary: { color: colors.foreground, fontSize: 18, fontWeight: "600" as const },
    workers: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
    worker: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    workerText: { color: colors.foregroundMuted, fontSize: 13 },
    row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 2 },
    title: { color: colors.foreground, fontSize: 15 },
    running: { color: colors.accent, fontSize: 13 },
    failed: { color: colors.statusDanger, fontSize: 13 },
    meta: { color: colors.foregroundMuted, fontSize: 13 },
    detail: { color: colors.foregroundMuted, fontSize: 12, marginTop: 4 },
    error: { color: colors.statusDanger },
  };
}

type Styles = ReturnType<typeof createStyles>;

function lineStyle(job: BuildJob, styles: Styles) {
  if (job.state === "running") return styles.running;
  if (job.state === "finished" && job.exit !== 0 && job.exit !== 130) return styles.failed;
  return styles.meta;
}

interface JobRowProps {
  job: BuildJob;
  expanded: boolean;
  styles: Styles;
  onToggle: (id: string) => void;
}

const JobRow = memo(function JobRow({ job, expanded, styles, onToggle }: JobRowProps) {
  const handlePress = useCallback(() => onToggle(job.id), [onToggle, job.id]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Build ${job.sequence}, ${job.project}, ${line(job)}`}
      onPress={handlePress}
      style={styles.row}
    >
      <Text style={styles.title} numberOfLines={1}>
        {job.project} · {job.task}
      </Text>
      <Text style={lineStyle(job, styles)} numberOfLines={expanded ? undefined : 1}>
        {line(job)}
      </Text>
      {expanded ? (
        <View>
          <Text style={styles.detail}>
            #{job.sequence} · {job.klass} · {job.priority} · Agent {job.agent} ·{" "}
            {workerName(job.worker)}
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

export function BuildQueuePanel({ theme, layout }: PluginWorkspacePanelProps) {
  const fetchStatus = useRpc(buildStatusRpc);
  const { data, error } = useQuery({
    queryKey: ["build-scheduler", "status"],
    queryFn: () => fetchStatus({ recent: 15 }),
    refetchInterval: 3000,
  });
  const [open, setOpen] = useState<string | null>(null);
  const styles = useMemo(
    () => createStyles(theme.colors, layout.compact),
    [theme.colors, layout.compact],
  );
  const toggle = useCallback(
    (id: string) => setOpen((current) => (current === id ? null : id)),
    [],
  );

  if (error || (data && !data.available)) {
    return (
      <View style={styles.unavailable}>
        <Text style={styles.summary}>Build-Scheduler nicht erreichbar</Text>
        <Text style={styles.error}>{error?.message ?? data?.error}</Text>
      </View>
    );
  }
  const jobs = data?.jobs ?? [];
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.summary}>{data ? counts(jobs) : "Lädt…"}</Text>
      <View style={styles.workers}>
        {(data?.workers ?? []).map((worker) => (
          <View key={worker.name} style={styles.worker}>
            <Text style={styles.workerText}>
              {worker.name}: {worker.detail}
            </Text>
          </View>
        ))}
      </View>
      <View>
        {jobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            expanded={open === job.id}
            styles={styles}
            onToggle={toggle}
          />
        ))}
      </View>
    </ScrollView>
  );
}
