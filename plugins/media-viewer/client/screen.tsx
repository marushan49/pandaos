import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import {
  Icon,
  MediaView,
  saveMedia,
  ScrollView,
  TextInput,
} from "@getpaseo/plugin/client/react-native";
import type { RpcOutput } from "@getpaseo/plugin";
import { browseMedia, readMedia } from "../shared/contracts.js";

function entryName(path: string) {
  return path.split(/[\\/]/).pop() || "Media";
}

function MediaEntry({
  entry,
  busy,
  onOpen,
  foreground,
  muted,
}: {
  entry: RpcOutput<typeof browseMedia>["entries"][number];
  busy: boolean;
  onOpen(path: string, directory: boolean): Promise<void>;
  foreground: string;
  muted: string;
}) {
  const open = useCallback(
    () => void onOpen(entry.path, entry.directory),
    [onOpen, entry.path, entry.directory],
  );
  const textStyle = useMemo(() => ({ flex: 1, color: foreground }), [foreground]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${entry.name}`}
      disabled={busy}
      onPress={open}
      style={entryStyle}
    >
      <Icon name={entry.directory ? "Folder" : "FileImage"} color={muted} />
      <Text numberOfLines={1} style={textStyle}>
        {entry.name}
      </Text>
    </Pressable>
  );
}

const entryStyle = {
  padding: 12,
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 10,
};
const flexStyle = { flex: 1 };
const listStyle = { gap: 4 };
const rowStyle = { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 };
const mediaStyle = { flex: 1, minHeight: 180, gap: 8 };

export function MediaScreen({ theme, layout, host, params }: PluginScreenProps) {
  const browse = useRpc(browseMedia);
  const read = useRpc(readMedia);
  const initialPath = params.path || params.directory || "~";
  const [input, setInput] = useState(initialPath);
  const [folder, setFolder] = useState<RpcOutput<typeof browseMedia> | null>(null);
  const [media, setMedia] = useState<RpcOutput<typeof readMedia> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const request = useRef(0);
  const invalidate = useCallback(() => {
    request.current++;
  }, []);
  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        minHeight: 0,
        padding: layout.compact ? 12 : 24,
        gap: 12,
        backgroundColor: theme.colors.surface0,
      },
      action: { padding: 10, borderRadius: 8, backgroundColor: theme.colors.surface2 },
      parent: {
        padding: 10,
        borderRadius: 8,
        backgroundColor: theme.colors.surface2,
        flexDirection: "row" as const,
        gap: 10,
      },
      text: { color: theme.colors.foreground },
      muted: { color: theme.colors.foregroundMuted },
      name: { flex: 1, color: theme.colors.foreground },
      input: {
        flex: 1,
        minWidth: 0,
        padding: 10,
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface1,
        borderRadius: 8,
      },
    }),
    [theme, layout.compact],
  );

  const load = useCallback(
    async (path: string, directory: boolean) => {
      const token = ++request.current;
      setBusy(true);
      setError(null);
      setNotice(null);
      setMedia(null);
      try {
        if (directory) {
          const result = await browse({ path });
          if (token !== request.current) return;
          setFolder(result);
          setInput(result.path);
        } else {
          let result = await read({ path, offset: 0 });
          const chunks = [result.base64];
          while (result.offset < result.size) {
            if (token !== request.current) return;
            result = await read({ path, offset: result.offset, revision: result.revision });
            chunks.push(result.base64);
          }
          if (token !== request.current) return;
          setMedia({ ...result, base64: chunks.join("") });
          setInput(result.path);
        }
      } catch (cause) {
        if (token === request.current)
          setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (token === request.current) setBusy(false);
      }
    },
    [browse, read],
  );

  useEffect(() => {
    setFolder(null);
    setInput(initialPath);
    void load(initialPath, !params.path);
    return invalidate;
  }, [host.id, initialPath, params.path, params.revision, load, invalidate]);

  const download = useCallback(async () => {
    if (!media || saving) return;
    const token = request.current;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await saveMedia({
        base64: media.base64,
        mimeType: media.mimeType,
        fileName: entryName(media.path),
      });
      if (token === request.current)
        setNotice(
          result === "downloaded"
            ? "Download started on this device."
            : "Save or share dialog closed.",
        );
    } catch (cause) {
      if (token === request.current)
        setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }, [media, saving]);
  const openFile = useCallback(() => void load(input, false), [input, load]);
  const openFolder = useCallback(() => void load(input, true), [input, load]);
  const parentFolder = useCallback(() => {
    if (folder) void load(folder.parent, true);
  }, [folder, load]);
  const back = useCallback(() => {
    void load(folder?.path || params.directory || "~", true);
  }, [folder, params.directory, load]);
  const triggerDownload = useCallback(() => void download(), [download]);

  return (
    <View style={styles.screen}>
      <Text style={styles.muted}>Pictures and videos on {host.label}</Text>
      <View style={rowStyle}>
        <TextInput
          accessibilityLabel="Media path"
          value={input}
          onChangeText={setInput}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={openFile}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open media file"
          disabled={busy}
          onPress={openFile}
          style={styles.action}
        >
          <Icon name="FileImage" color={theme.colors.foreground} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Browse media folder"
          disabled={busy}
          onPress={openFolder}
          style={styles.action}
        >
          <Icon name="FolderOpen" color={theme.colors.foreground} />
        </Pressable>
      </View>
      {busy && (
        <ActivityIndicator
          accessibilityLabel="Loading media"
          color={theme.colors.foregroundMuted}
        />
      )}
      {error && (
        <Text accessibilityRole="alert" style={styles.text}>
          {error}
        </Text>
      )}
      {notice && (
        <Text accessibilityRole="alert" style={styles.muted}>
          {notice}
        </Text>
      )}
      {media ? (
        <View style={mediaStyle}>
          <View style={rowStyle}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to media folder"
              onPress={back}
              style={styles.action}
            >
              <Icon name="ArrowLeft" color={theme.colors.foreground} />
            </Pressable>
            <Text numberOfLines={1} style={styles.name}>
              {entryName(media.path)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Download media"
              disabled={saving}
              onPress={triggerDownload}
              style={styles.action}
            >
              <Icon name="Download" color={theme.colors.foreground} />
            </Pressable>
          </View>
          <MediaView
            key={media.path}
            base64={media.base64}
            mimeType={media.mimeType}
            accessibilityLabel={entryName(media.path)}
            foreground={theme.colors.foreground}
            background={theme.colors.surface1}
            onError={setError}
          />
        </View>
      ) : (
        <ScrollView style={flexStyle} contentContainerStyle={listStyle}>
          {folder && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Parent media folder"
              disabled={busy || folder.parent === folder.path}
              onPress={parentFolder}
              style={styles.parent}
            >
              <Icon name="ArrowUp" color={theme.colors.foreground} />
              <Text style={styles.text}>Parent folder</Text>
            </Pressable>
          )}
          {folder?.entries.map((entry) => (
            <MediaEntry
              key={entry.path}
              entry={entry}
              busy={busy}
              onOpen={load}
              foreground={theme.colors.foreground}
              muted={theme.colors.foregroundMuted}
            />
          ))}
          {folder?.entries.length === 0 && (
            <Text style={styles.muted}>No pictures or videos in this folder.</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}
