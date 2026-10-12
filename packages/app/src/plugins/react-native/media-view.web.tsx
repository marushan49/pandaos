import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Buffer } from "buffer";
import type { MediaViewProps } from "@getpaseo/plugin/client/react-native";
import { MediaControls } from "./media-controls";

const videoStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  minHeight: 0,
  flex: 1,
  objectFit: "contain",
};
const viewportStyle: CSSProperties = { flex: 1, minHeight: 0, overflow: "auto" };

export function MediaView({
  base64,
  mimeType,
  accessibilityLabel,
  foreground,
  background,
  onError,
}: MediaViewProps) {
  const [source, setSource] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    setSource(url);
    setZoom(1);
    return () => URL.revokeObjectURL(url);
  }, [base64, mimeType]);
  const failure = useCallback(
    () => onError("This client cannot decode the media. Try PNG/JPEG or an H.264 MP4 video."),
    [onError],
  );
  const rootStyle = useMemo<CSSProperties>(
    () => ({
      display: "flex",
      flex: 1,
      minHeight: 0,
      flexDirection: "column",
      gap: 8,
      color: foreground,
      background,
    }),
    [foreground, background],
  );
  const imageStyle = useMemo<CSSProperties>(
    () => ({
      display: "block",
      width: `${zoom * 100}%`,
      height: `${zoom * 100}%`,
      objectFit: "contain",
    }),
    [zoom],
  );
  return (
    <div style={rootStyle}>
      {mimeType.startsWith("video/") ? (
        <video
          key={source}
          aria-label={accessibilityLabel}
          src={source || undefined}
          controls
          playsInline
          preload="metadata"
          onError={failure}
          style={videoStyle}
        />
      ) : (
        <>
          <MediaControls zoom={zoom} setZoom={setZoom} foreground={foreground} />
          <div style={viewportStyle}>
            {source && (
              <img alt={accessibilityLabel} src={source} onError={failure} style={imageStyle} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
