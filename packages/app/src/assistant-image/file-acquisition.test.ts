import { describe, expect, it } from "vitest";
import type { AttachmentMetadata } from "@/attachments/types";
import { readAssistantVideo } from "@/assistant-video/read";
import {
  createAssistantImageFileAcquisition,
  type AssistantImageFileAcquisitionPort,
} from "./file-acquisition";

class MemoryFileAcquisitionPort implements AssistantImageFileAcquisitionPort {
  readonly reads: Array<{ cwd: string; path: string }> = [];

  async readFile(cwd: string, path: string) {
    this.reads.push({ cwd, path });
    return {
      kind: "image" as const,
      path,
      mime: "image/png",
      size: 4,
      modifiedAt: "1",
      bytes: new Uint8Array([1, 2, 3, 4]),
    };
  }

  async persist(input: { id: string; mimeType: string; fileName: string | null }) {
    return {
      id: input.id,
      mimeType: input.mimeType,
      storageType: "web-indexeddb" as const,
      storageKey: input.id,
      fileName: input.fileName,
      byteSize: 4,
      createdAt: 1,
    } satisfies AttachmentMetadata;
  }
}

describe("assistant image file acquisition", () => {
  it("recreates the same acquisition with a live port after reconnect", async () => {
    const common = {
      resolution: { kind: "file_rpc" as const, cwd: "/workspace", path: "reconnect.png" },
      serverId: "server",
      occurrenceKey: "agent:message:reconnect-image",
      unavailableMessage: "Image unavailable",
    };
    const disconnected = createAssistantImageFileAcquisition({ ...common, port: null });
    const connectedPort = new MemoryFileAcquisitionPort();
    const connected = createAssistantImageFileAcquisition({ ...common, port: connectedPort });

    expect(disconnected?.key).toBe(connected?.key);
    await expect(disconnected?.locate()).rejects.toThrow("Image unavailable");
    await expect(connected?.locate()).resolves.toMatchObject({ mimeType: "image/png" });
    expect(connectedPort.reads).toEqual([{ cwd: "/workspace", path: "reconnect.png" }]);
  });
});

describe("assistant video file acquisition", () => {
  it("reads bounded chunks from the supplied message host with its workspace path", async () => {
    const calls: unknown[] = [];
    const client = {
      invokePluginRpc: async (...args: [string, string, unknown]) => {
        calls.push(args);
        return {
          path: "/workspace/movie.mp4",
          mimeType: "video/mp4",
          size: 4,
          revision: "one",
          offset: calls.length === 1 ? 3 : 4,
          base64: calls.length === 1 ? "AQID" : "BA==",
        };
      },
    };
    await expect(
      readAssistantVideo({
        source: "movie.mp4",
        workspaceRoot: "/workspace",
        client,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ base64: "AQIDBA==", mimeType: "video/mp4", fileName: "movie.mp4" });
    expect(calls).toEqual([
      ["media-viewer", "read", { path: "/workspace/movie.mp4", offset: 0, revision: undefined }],
      ["media-viewer", "read", { path: "/workspace/movie.mp4", offset: 3, revision: "one" }],
    ]);
  });

  it("rejects a changed revision rather than joining bytes from different videos", async () => {
    let calls = 0;
    const client = {
      invokePluginRpc: async () => ({
        path: "/movie.mp4",
        mimeType: "video/mp4",
        size: 4,
        revision: ++calls === 1 ? "one" : "two",
        offset: calls === 1 ? 3 : 4,
        base64: calls === 1 ? "AQID" : "BA==",
      }),
    };
    await expect(
      readAssistantVideo({ source: "/movie.mp4", client, signal: new AbortController().signal }),
    ).rejects.toThrow("changed");
  });

  it("drops a host response after cancellation", async () => {
    const controller = new AbortController();
    const client = {
      invokePluginRpc: async () => {
        controller.abort();
        return {
          path: "/movie.mp4",
          mimeType: "video/mp4",
          size: 4,
          revision: "one",
          offset: 4,
          base64: "AQIDBA==",
        };
      },
    };
    await expect(
      readAssistantVideo({ source: "/movie.mp4", client, signal: controller.signal }),
    ).rejects.toThrow("canceled");
  });
  it("rejects large chunk bytes before accepting a tiny offset advance", async () => {
    const client = {
      invokePluginRpc: async () => ({
        path: "/movie.mp4",
        mimeType: "video/mp4",
        size: 4,
        revision: "one",
        offset: 1,
        base64: "AQID",
      }),
    };
    await expect(
      readAssistantVideo({ source: "/movie.mp4", client, signal: new AbortController().signal }),
    ).rejects.toThrow("chunk size");
  });
  it("rejects base64 junk rather than retaining bytes the decoder ignores", async () => {
    const client = {
      invokePluginRpc: async () => ({
        path: "/movie.mp4",
        mimeType: "video/mp4",
        size: 6,
        revision: "one",
        offset: 3,
        base64: "AAAA" + "!".repeat(100),
      }),
    };
    await expect(
      readAssistantVideo({ source: "/movie.mp4", client, signal: new AbortController().signal }),
    ).rejects.toThrow("chunk size");
  });
});
