import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { Button } from "@/components/ui/button";
import { Download, Play } from "@/components/icons/ui-icons";
import { MediaView } from "@/plugins/react-native/media-view";
import { saveMedia } from "@/plugins/react-native/save-media";
import { readAssistantVideo, type AssistantVideoData } from "@/assistant-video/read";
import { useAssistantFileLinkActions } from "@/assistant-file-links";

const ThemedMediaView = withUnistyles(MediaView, (theme) => ({
  foreground: theme.colors.foreground,
  background: theme.colors.surface1,
}));

export function AssistantMarkdownVideo({
  source,
  label,
  client,
  workspaceRoot,
  serverId,
}: {
  source: string;
  label?: string;
  client?: DaemonClient | null;
  workspaceRoot?: string;
  serverId?: string;
}) {
  const [media, setMedia] = useState<AssistantVideoData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const links = useAssistantFileLinkActions();
  useEffect(() => {
    setMedia(null);
    setError(null);
    setNotice(null);
    setBusy(false);
    return () => controller.current?.abort();
  }, [source, workspaceRoot, client, serverId]);
  const load = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError(null);
    try {
      const video = await readAssistantVideo({
        source,
        client,
        workspaceRoot,
        signal: request.signal,
      });
      if (!request.signal.aborted) {
        setMedia(video);
        return video;
      }
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
    return null;
  }, [source, client, workspaceRoot]);
  const download = useCallback(async () => {
    if (busy) return;
    const video = media || (await load());
    if (!video) return;
    const signal = controller.current?.signal;
    setBusy(true);
    try {
      const result = await saveMedia(video);
      if (signal?.aborted) return;
      setNotice(
        result === "downloaded"
          ? "Download started on this device."
          : "Save or share dialog closed.",
      );
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, [media, busy, load]);
  const startLoading = useCallback(() => void load(), [load]);
  const startDownload = useCallback(() => void download(), [download]);
  const openOriginal = useCallback(
    () => links.open({ href: source }, "preferred"),
    [links, source],
  );
  const caption = label || source.split(/[\\/]/).pop() || "Video";
  return (
    <View style={styles.root} testID="assistant-video-preview">
      <Text style={styles.caption}>{caption}</Text>
      {media ? (
        <View style={styles.player}>
          <ThemedMediaView
            base64={media.base64}
            mimeType={media.mimeType}
            accessibilityLabel={caption}
            onError={setError}
          />
        </View>
      ) : (
        <View style={styles.placeholder}>
          <Button
            leftIcon={Play}
            accessibilityLabel={`Load video: ${caption}`}
            onPress={startLoading}
            disabled={busy}
            variant="secondary"
          >
            {busy ? "Loading video…" : "Load video"}
          </Button>
        </View>
      )}
      <View style={styles.actions}>
        <Button
          leftIcon={Download}
          accessibilityLabel={`Download video: ${caption}`}
          onPress={startDownload}
          disabled={busy}
          variant="ghost"
          size="xs"
        >
          Download
        </Button>
        <Button
          accessibilityLabel={`Open original video: ${caption}`}
          onPress={openOriginal}
          variant="ghost"
          size="xs"
        >
          Open original
        </Button>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {notice && <Text style={styles.caption}>{notice}</Text>}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { width: "100%", maxWidth: 960, gap: 8, marginVertical: 8 },
  placeholder: {
    width: "100%",
    aspectRatio: 16 / 9,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.md,
  },
  player: {
    width: "100%",
    aspectRatio: 16 / 9,
    overflow: "hidden",
    borderRadius: theme.borderRadius.md,
  },
  caption: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.ui,
    fontSize: theme.fontSize.sm,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  error: {
    color: theme.colors.destructive,
    fontFamily: theme.fontFamily.ui,
    fontSize: theme.fontSize.sm,
  },
}));
