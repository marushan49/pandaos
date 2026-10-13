import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useRpc, useWorkspace } from "@getpaseo/plugin/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput } from "react-native";
import { visionGet, visionSave } from "../shared/vision";

export function VisionPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  const cwd = useWorkspace(workspaceId, (workspace) => workspace.directory) ?? "";
  const readVision = useRpc(visionGet);
  const writeVision = useRpc(visionSave);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["workspace-vision", cwd],
    queryFn: () => readVision({ cwd }),
    enabled: cwd.length > 0,
  });
  const [projectGoal, setProjectGoal] = useState("");
  const [workspaceText, setWorkspaceText] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (query.data && !loaded) {
      setProjectGoal(query.data.projectGoal);
      setWorkspaceText(query.data.workspaceText);
      setLoaded(true);
    }
  }, [query.data, loaded]);
  const mutation = useMutation({
    mutationFn: () => writeVision({ cwd, projectGoal, workspaceText }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace-vision", cwd] }),
  });
  const onSave = useCallback(() => {
    mutation.mutate();
  }, [mutation]);
  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: { padding: layout.compact ? 16 : 24, gap: 14 },
      title: { color: theme.colors.foreground, fontSize: 18, fontWeight: "600" as const },
      label: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600" as const },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      error: { color: theme.colors.statusDanger, fontSize: 13 },
      input: {
        minHeight: 120,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
        color: theme.colors.foreground,
        textAlignVertical: "top" as const,
        fontSize: 14,
      },
      button: {
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: "center" as const,
        backgroundColor: theme.colors.accent,
      },
      buttonText: {
        color: theme.colors.accentForeground,
        fontSize: 14,
        fontWeight: "600" as const,
      },
    }),
    [theme, layout.compact],
  );
  const progress = query.data?.progress;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Vision</Text>
      {progress ? (
        <Text style={styles.muted}>
          {`Open: ${progress.open} | Done: ${progress.done} | Runs last hour: ${progress.runsLastHour}`}
        </Text>
      ) : (
        <Text style={styles.muted}>Reading...</Text>
      )}
      {progress?.blocked ? (
        <Text style={styles.error}>{`Blocked: ${progress.blocked}`}</Text>
      ) : null}
      <Text style={styles.label}>Project goal (all workspaces of this project)</Text>
      <TextInput
        multiline
        value={projectGoal}
        onChangeText={setProjectGoal}
        style={styles.input}
        placeholder="What the project is for"
        placeholderTextColor={theme.colors.foregroundMuted}
      />
      <Text style={styles.label}>Workspace vision and milestones</Text>
      <TextInput
        multiline
        value={workspaceText}
        onChangeText={setWorkspaceText}
        style={styles.input}
        placeholder="What this workspace should achieve"
        placeholderTextColor={theme.colors.foregroundMuted}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save vision"
        onPress={onSave}
        style={styles.button}
      >
        <Text style={styles.buttonText}>{mutation.isPending ? "Saving" : "Save"}</Text>
      </Pressable>
    </ScrollView>
  );
}
