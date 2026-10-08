import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { AttachmentLightbox } from "@/components/attachment-lightbox";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import type { BrowserScreenshotTarget } from "@/tool-calls/browser-screenshot";

const MAX_CACHED_SCREENSHOTS = 24;
const screenshotCache = new Map<string, string>();

function cacheScreenshot(key: string, uri: string): void {
  screenshotCache.set(key, uri);
  const oldest = screenshotCache.keys().next().value;
  if (screenshotCache.size > MAX_CACHED_SCREENSHOTS && oldest !== undefined) {
    screenshotCache.delete(oldest);
  }
}

function useBrowserScreenshotUri(serverId: string, target: BrowserScreenshotTarget): string | null {
  const client = useHostRuntimeClient(serverId);
  const key = `${serverId}/${target.workspaceId}/${target.runId}/${target.name}`;
  const [uri, setUri] = useState<string | null>(() => screenshotCache.get(key) ?? null);

  useEffect(() => {
    const cached = screenshotCache.get(key);
    if (cached) {
      setUri(cached);
      return;
    }
    if (!client) return;
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const payload = await client.getEvidenceArtifact(
          target.workspaceId,
          target.runId,
          target.name,
        );
        if (cancelled || payload.error || !payload.dataBase64) return;
        const loaded = `data:${payload.artifact?.contentType ?? "image/png"};base64,${payload.dataBase64}`;
        cacheScreenshot(key, loaded);
        setUri(loaded);
      } catch {
        return;
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [client, key, target.name, target.runId, target.workspaceId]);

  return uri;
}

export function BrowserScreenshotPreview({
  serverId,
  target,
}: {
  serverId: string;
  target: BrowserScreenshotTarget;
}) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const uri = useBrowserScreenshotUri(serverId, target);
  const [open, setOpen] = useState(false);
  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);
  const imageSource = useMemo(() => (uri ? { uri } : null), [uri]);
  const lightboxSource = useMemo(
    () => (open && uri ? { type: "uri" as const, uri } : null),
    [open, uri],
  );

  if (!imageSource) return null;
  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={t("toolCallDetails.screenshot")}
        onPress={handleOpen}
        style={isCompact ? styles.frameCompact : styles.frame}
        testID="browser-screenshot-preview"
      >
        <Image source={imageSource} resizeMode="contain" style={styles.image} />
      </Pressable>
      <AttachmentLightbox source={lightboxSource} onClose={handleClose} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  frame: {
    width: "100%",
    maxWidth: 480,
    aspectRatio: 16 / 9,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.base,
    overflow: "hidden",
    backgroundColor: theme.colors.surface2,
  },
  frameCompact: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.base,
    overflow: "hidden",
    backgroundColor: theme.colors.surface2,
  },
  image: { width: "100%", height: "100%" },
}));
