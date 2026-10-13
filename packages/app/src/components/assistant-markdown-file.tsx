import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "@/components/icons/ui-icons";
import { useFileDownload } from "@/hooks/use-file-download";
import { useAssistantFileLinkActions } from "@/assistant-file-links";
import { assistantFileCardPath, splitHostFilePath } from "@/assistant-file-card/source";

const ThemedFileIcon = withUnistyles(FileText, (theme) => ({
  color: theme.colors.foregroundMuted,
}));

export function AssistantMarkdownFile({
  source,
  label,
  serverId,
}: {
  source: string;
  label?: string;
  serverId?: string;
}) {
  const links = useAssistantFileLinkActions();
  const path = assistantFileCardPath(source) ?? source;
  const { directory, fileName } = useMemo(() => splitHostFilePath(path), [path]);
  const download = useFileDownload({ serverId: serverId ?? "", workspaceRoot: directory });
  const startDownload = useCallback(
    () => download({ fileName, path: fileName }),
    [download, fileName],
  );
  const openOriginal = useCallback(
    () => links.open({ href: source }, "preferred"),
    [links, source],
  );
  const title = label?.trim() || fileName;
  return (
    <View style={styles.root} testID="assistant-file-card">
      <View style={styles.header}>
        <ThemedFileIcon size={18} />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.path} numberOfLines={1} ellipsizeMode="middle">
            {path}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          leftIcon={Download}
          accessibilityLabel={`Download file: ${title}`}
          onPress={startDownload}
          disabled={!serverId}
          variant="secondary"
          size="xs"
        >
          Download
        </Button>
        <Button
          accessibilityLabel={`Show file on host: ${title}`}
          onPress={openOriginal}
          variant="ghost"
          size="xs"
        >
          Show on host
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    width: "100%",
    maxWidth: 560,
    gap: theme.spacing[2],
    marginVertical: theme.spacing[2],
    padding: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  header: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
  text: { flex: 1, minWidth: 0 },
  title: {
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.ui,
    fontSize: theme.fontSize.base,
  },
  path: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.ui,
    fontSize: theme.fontSize.sm,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] },
}));
