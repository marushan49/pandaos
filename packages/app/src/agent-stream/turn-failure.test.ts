import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import { buildRetrySubmission, classifyTurnFailure, projectFailedTurn } from "./turn-failure";

const at = new Date("2026-10-08T10:00:00.000Z");

function user(id: string, text: string): StreamItem {
  return { kind: "user_message", id, text, timestamp: at };
}

function assistant(id: string, text: string): StreamItem {
  return { kind: "assistant_message", id, text, timestamp: at };
}

describe("classifyTurnFailure", () => {
  it.each([
    ["Failed to authenticate: OAuth session expired and could not be refreshed", "auth"],
    ['{"error":{"type":"authentication_error"},"statusCode":401}', "auth"],
    ["Invalid API key. Please run /login", "auth"],
    ["rate_limit_exceeded: retry after 1840s", "limit"],
    ["You have hit your usage limit", "limit"],
    ['{"statusCode":429,"message":"Too many requests"}', "limit"],
    ["insufficient_quota", "limit"],
    ["read ECONNRESET", "network"],
    ["TypeError: fetch failed", "network"],
    ["Request timed out", "network"],
    ["Requested mock provider failure", "other"],
    ["", "other"],
  ])("classifies %j as %s", (raw, kind) => {
    expect(classifyTurnFailure(raw).kind).toBe(kind);
  });

  it("reads a retry delay only when the message states one", () => {
    expect(classifyTurnFailure("rate_limit_exceeded: retry after 1840s").retryAfterSeconds).toBe(
      1840,
    );
    expect(classifyTurnFailure("Rate limit hit. Try again in 3 minutes.").retryAfterSeconds).toBe(
      180,
    );
    expect(classifyTurnFailure("429, retry-after: 30").retryAfterSeconds).toBe(30);
    expect(classifyTurnFailure("Usage limit reached").retryAfterSeconds).toBeUndefined();
    expect(
      classifyTurnFailure("Quota exhausted, retry after 2026-10-08T12:00:00Z").retryAfterSeconds,
    ).toBeUndefined();
  });
});

describe("projectFailedTurn", () => {
  const tail = [
    user("u1", "first"),
    assistant("a1", "done"),
    user("u2", "fix the build"),
    assistant("a2", "[System Error] Requested mock provider failure"),
  ];

  it("turns a failed turn into a failure instead of a finished turn", () => {
    const result = projectFailedTurn({
      lastError: "Requested mock provider failure",
      isTurnActive: false,
      tail,
      head: [],
    });

    expect(result.failure).toMatchObject({
      kind: "other",
      message: "Requested mock provider failure",
      prompt: { id: "u2", text: "fix the build" },
      touchedWorkspace: false,
      errorRow: { id: "a2" },
    });
    expect(result.tail.map((item) => item.id)).toEqual(["u1", "a1", "u2"]);
  });

  it("drops the system error row from the live head", () => {
    const result = projectFailedTurn({
      lastError: "boom",
      isTurnActive: false,
      tail: tail.slice(0, 3),
      head: [assistant("a2", "[System Error] boom")],
    });

    expect(result.head).toEqual([]);
    expect(result.tail.map((item) => item.id)).toEqual(["u1", "a1", "u2"]);
    expect(result.failure?.prompt?.id).toBe("u2");
  });

  it("notes when the failed turn already ran a tool", () => {
    const result = projectFailedTurn({
      lastError: "boom",
      isTurnActive: false,
      tail: [
        user("u1", "edit"),
        {
          kind: "tool_call",
          id: "t1",
          timestamp: at,
          payload: { source: "agent", data: {} },
        } as unknown as StreamItem,
      ],
      head: [],
    });

    expect(result.failure?.touchedWorkspace).toBe(true);
  });

  it("keeps the timeline untouched without a failure or while a turn runs", () => {
    for (const input of [
      { lastError: null, isTurnActive: false },
      { lastError: "boom", isTurnActive: true },
    ]) {
      const result = projectFailedTurn({ ...input, tail, head: [] });
      expect(result.failure).toBeNull();
      expect(result.tail).toBe(tail);
    }
  });
});

describe("buildRetrySubmission", () => {
  it("resends the prompt text, images and attachments", () => {
    const metadata = {
      id: "img-1",
      mimeType: "image/png",
      storageType: "web-indexeddb" as const,
      storageKey: "img-1",
      createdAt: 1,
    };
    const attachment = {
      type: "uploaded_file" as const,
      id: "file-1",
      fileName: "notes.txt",
      mimeType: "text/plain",
      size: 4,
      path: "/tmp/notes.txt",
    };

    expect(
      buildRetrySubmission({
        kind: "user_message",
        id: "u1",
        text: "try this",
        timestamp: at,
        images: [metadata],
        attachments: [attachment],
      }),
    ).toEqual({
      text: "try this",
      attachments: [{ kind: "image", metadata }],
      agentAttachments: [attachment],
    });
  });
});
