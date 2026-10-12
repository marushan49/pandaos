import { Buffer } from "buffer";
import { z } from "zod";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { resolveAssistantImageSource } from "@/utils/assistant-image-source";
import { isAbsolutePath } from "@/utils/path";
import { getFileNameFromPath, parseDataUrl } from "@/attachments/utils";
import { videoMimeType } from "./source";

const maxBytes = 64 * 1024 * 1024;
const chunkSchema = z.object({
  path: z.string(),
  mimeType: z.string().startsWith("video/"),
  base64: z.string().max(256 * 1024),
  offset: z.number().int().min(0).max(maxBytes),
  size: z.number().int().min(1).max(maxBytes),
  revision: z.string(),
});

export interface AssistantVideoData {
  base64: string;
  mimeType: string;
  fileName: string;
}

export async function readAssistantVideo(input: {
  source: string;
  workspaceRoot?: string;
  client?: Pick<DaemonClient, "invokePluginRpc"> | null;
  signal: AbortSignal;
}): Promise<AssistantVideoData> {
  const mimeType = videoMimeType(input.source);
  if (!mimeType) throw new Error("Unsupported video source.");
  const resolution = resolveAssistantImageSource(input);
  if (!resolution) throw new Error("The video's workspace is unavailable.");
  if (resolution.kind === "file_rpc") {
    if (!input.client) throw new Error("Connect to this video's host to load it.");
    const path =
      isAbsolutePath(resolution.path) || resolution.path.startsWith("~")
        ? resolution.path
        : `${resolution.cwd.replace(/[\\/]+$/, "")}/${resolution.path}`;
    return readHostVideo(input.client, path, input.signal);
  }
  if (input.signal.aborted) throw new Error("Video loading canceled.");
  if (resolution.uri.startsWith("data:")) {
    const data = parseDataUrl(resolution.uri);
    if (data.base64.length > Math.ceil(maxBytes / 3) * 4)
      throw new Error("Video exceeds the 64 MiB preview limit.");
    return { ...data, fileName: "video.mp4" };
  }
  return readRemoteVideo(resolution.uri, mimeType, input.signal);
}

async function readHostVideo(
  client: Pick<DaemonClient, "invokePluginRpc">,
  path: string,
  signal: AbortSignal,
): Promise<AssistantVideoData> {
  let offset = 0;
  let revision: string | undefined;
  let size: number | undefined;
  let encodedLength = 0;
  const chunks: string[] = [];
  while (true) {
    if (signal.aborted) throw new Error("Video loading canceled.");
    const chunk = chunkSchema.parse(
      await client.invokePluginRpc("media-viewer", "read", {
        path,
        offset,
        revision,
      }),
    );
    if (signal.aborted) throw new Error("Video loading canceled.");
    if (
      chunk.offset <= offset ||
      chunk.offset > chunk.size ||
      (size !== undefined && chunk.size !== size) ||
      (revision !== undefined && chunk.revision !== revision)
    ) {
      throw new Error("The video changed while loading. Load it again.");
    }
    const decoded = Buffer.from(chunk.base64, "base64");
    const bytes = decoded.byteLength;
    encodedLength += chunk.base64.length;
    if (
      decoded.toString("base64") !== chunk.base64 ||
      encodedLength > Math.ceil(maxBytes / 3) * 4 ||
      bytes !== chunk.offset - offset ||
      (chunk.offset < chunk.size && bytes % 3 !== 0)
    ) {
      throw new Error("Invalid video chunk size.");
    }
    chunks.push(chunk.base64);
    offset = chunk.offset;
    size = chunk.size;
    revision = chunk.revision;
    if (offset === size) {
      const base64 = chunks.join("");
      if (Buffer.from(base64, "base64").byteLength !== size)
        throw new Error("Incomplete video download.");
      return {
        base64,
        mimeType: chunk.mimeType,
        fileName: getFileNameFromPath(chunk.path) || "video.mp4",
      };
    }
  }
}

async function readRemoteVideo(
  uri: string,
  mimeType: string,
  signal: AbortSignal,
): Promise<AssistantVideoData> {
  const { fetch } = await import("expo/fetch");
  const request = new AbortController();
  const abort = () => request.abort();
  signal.addEventListener("abort", abort);
  if (signal.aborted) request.abort();
  try {
    const response = await fetch(uri, { signal: request.signal });
    if (!response.ok) throw new Error(`Video request failed (${response.status}).`);
    if (Number(response.headers.get("content-length")) > maxBytes)
      throw new Error("Video exceeds the 64 MiB preview limit.");
    const reader = response.body?.getReader();
    if (!reader)
      throw new Error("This client cannot load the remote video. Open its original link.");
    const parts: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        if (signal.aborted) throw new Error("Video loading canceled.");
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > maxBytes) throw new Error("Video exceeds the 64 MiB preview limit.");
        parts.push(part.value);
      }
    } finally {
      await reader.cancel();
    }
    if (!length) throw new Error("The video is empty.");
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    return {
      base64: Buffer.from(bytes).toString("base64"),
      mimeType,
      fileName: getFileNameFromPath(uri.split(/[?#]/)[0] || "") || "video.mp4",
    };
  } finally {
    signal.removeEventListener("abort", abort);
    request.abort();
  }
}
