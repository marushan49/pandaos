import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, ScrollView, View } from "react-native";
import { WebView } from "react-native-webview";
import * as FileSystem from "expo-file-system/legacy";
import { MediaControls } from "./media-controls";
import type { LayoutChangeEvent } from "react-native";
import type { WebViewErrorEvent } from "react-native-webview/lib/WebViewTypes";
import type { MediaViewProps } from "@getpaseo/plugin/client/react-native";

const flexStyle = { flex: 1 };
const mediaOrigins = ["file://*", "about:blank"];
const videoExtensions: Readonly<Record<string, string>> = {
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export function MediaView({
  base64,
  mimeType,
  accessibilityLabel,
  foreground,
  background,
  onError,
}: MediaViewProps) {
  const [file, setFile] = useState<{ uri: string; directory: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewport, setViewport] = useState({ width: 1, height: 180 });
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const video = mimeType.startsWith("video/");
  useEffect(() => {
    setFile(null);
    setZoom(1);
    if (!video) return;
    let active = true;
    const directory = `${FileSystem.cacheDirectory}pandaos-media-${Date.now()}-${Math.random().toString(36).slice(2)}/`;
    const extension = videoExtensions[mimeType] || "mp4";
    const uri = `${directory}video.${extension}`;
    const player = `${directory}player.html`;
    const write = async () => {
      try {
        if (!FileSystem.cacheDirectory) throw new Error("Media cache is unavailable.");
        await FileSystem.makeDirectoryAsync(directory);
        await FileSystem.writeAsStringAsync(uri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src file:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><style>html,body{margin:0;height:100%;background:transparent}video{width:100%;height:100%;object-fit:contain}</style><video src="video.${extension}" controls playsinline preload="metadata" onerror="window.ReactNativeWebView.postMessage('decode-error')"></video>`;
        await FileSystem.writeAsStringAsync(player, html);
        if (active) setFile({ uri: player, directory });
        else await FileSystem.deleteAsync(directory, { idempotent: true });
      } catch (cause) {
        if (active) onErrorRef.current(cause instanceof Error ? cause.message : String(cause));
      }
    };
    void write();
    return () => {
      active = false;
      void FileSystem.deleteAsync(directory, { idempotent: true }).catch(() => undefined);
    };
  }, [base64, mimeType, video]);
  const rootStyle = useMemo(
    () => ({ flex: 1, minHeight: 0, gap: 8, backgroundColor: background }),
    [background],
  );
  const webStyle = useMemo(() => ({ flex: 1, backgroundColor: background }), [background]);
  const imageStyle = useMemo(
    () => ({ width: viewport.width * zoom, height: viewport.height * zoom }),
    [viewport, zoom],
  );
  const imageSource = useMemo(
    () => ({ uri: `data:${mimeType};base64,${base64}` }),
    [mimeType, base64],
  );
  const source = useMemo(() => ({ uri: file?.uri || "about:blank" }), [file]);
  const layout = useCallback(
    (event: LayoutChangeEvent) => setViewport(event.nativeEvent.layout),
    [],
  );
  const pictureError = useCallback(
    () => onErrorRef.current("This client cannot decode the picture. Try PNG or JPEG."),
    [],
  );
  const videoError = useCallback(
    () => onErrorRef.current("This client cannot decode the video. Try an H.264 MP4 video."),
    [],
  );
  const webError = useCallback(
    (event: WebViewErrorEvent) => onErrorRef.current(event.nativeEvent.description),
    [],
  );
  if (video) {
    if (!file) return <ActivityIndicator accessibilityLabel="Preparing video" color={foreground} />;
    return (
      <WebView
        accessibilityLabel={accessibilityLabel}
        source={source}
        originWhitelist={mediaOrigins}
        allowFileAccess
        allowingReadAccessToURL={file.directory}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction
        onMessage={videoError}
        onError={webError}
        style={webStyle}
      />
    );
  }

  return (
    <View style={rootStyle}>
      <MediaControls zoom={zoom} setZoom={setZoom} foreground={foreground} />
      <View style={flexStyle} onLayout={layout}>
        <ScrollView style={flexStyle} maximumZoomScale={4} minimumZoomScale={1}>
          <ScrollView horizontal>
            <Image
              accessibilityLabel={accessibilityLabel}
              source={imageSource}
              resizeMode="contain"
              onError={pictureError}
              style={imageStyle}
            />
          </ScrollView>
        </ScrollView>
      </View>
    </View>
  );
}
