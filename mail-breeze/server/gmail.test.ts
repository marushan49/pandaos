import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GmailReadToolSchema } from "./gmail-client";
import { gmailMail } from "./gmail-mail";
import { GmailConnection } from "./gmail";
import { BreezeService } from "./service";

const account = "breeze@example.com";
const start = new Date("2026-10-20T08:00:00.000Z");
const directories: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function service() {
  const directory = await mkdtemp(join(tmpdir(), "mail-breeze-gmail-"));
  directories.push(directory);
  return new BreezeService(directory);
}
function message() {
  return {
    id: "abc123",
    thread_id: "def456",
    internal_date: String(start.getTime() + 30000),
    payload: {
      mime_type: "multipart/mixed",
      headers: [
        { name: "From", value: '"Michael" <michael@example.com>' },
        { name: "Subject", value: "Bitte Summe prüfen" },
      ],
      parts: [
        {
          mime_type: "multipart/alternative",
          parts: [
            { mime_type: "text/plain", body: { content: "Bitte 120 + 150 + 180 prüfen. Grüße!" } },
            { mime_type: "text/html", body: { content: "<p>Doppelte HTML-Fassung</p>" } },
          ],
        },
        {
          mime_type: "text/plain",
          filename: "anlage.txt",
          body: { content: "Anhang nicht importieren" },
        },
      ],
    },
  };
}

describe("Gmail read boundary", () => {
  it("allows only the three deterministic read calls", () => {
    expect(GmailReadToolSchema.parse("gmail_read_email")).toBe("gmail_read_email");
    expect(GmailReadToolSchema.safeParse("gmail_send_email").success).toBe(false);
    expect(GmailReadToolSchema.safeParse("gmail_create_draft").success).toBe(false);
    expect(GmailReadToolSchema.safeParse("gmail_delete_emails").success).toBe(false);
  });
  it("imports text once, preserves sender and Gmail provenance, excludes attachments", () => {
    expect(gmailMail(message(), account)).toMatchObject({
      source: "gmail",
      id: `gmail:${account}:abc123`,
      conversationId: `gmail:${account}:def456`,
      sender: "Michael",
      senderEmail: "michael@example.com",
      body: "Bitte 120 + 150 + 180 prüfen. Grüße!",
      bulk: false,
    });
  });
  it("flags bulk mail from precedence and auto-submitted headers only", () => {
    const base = message();
    const withHeader = (name: string, value: string) => ({
      ...base,
      payload: { ...base.payload, headers: [...base.payload.headers, { name, value }] },
    });
    expect(gmailMail(withHeader("List-Unsubscribe", "<mailto:x@y>"), account)?.bulk).toBe(false);
    expect(gmailMail(withHeader("Precedence", "bulk"), account)?.bulk).toBe(true);
    expect(gmailMail(withHeader("Auto-Submitted", "auto-generated"), account)?.bulk).toBe(true);
    expect(gmailMail(withHeader("Auto-Submitted", "no"), account)?.bulk).toBe(false);
  });
  it("uses plain text from HTML-only messages and validates source IDs", () => {
    const base = message();
    const raw = {
      ...base,
      payload: {
        ...base.payload,
        parts: [
          {
            mime_type: "text/html",
            body: { content: "<style>hide</style><p>Hallo &amp; Grüße</p><script>bad()</script>" },
          },
        ],
      },
    };
    expect(gmailMail(raw, account)?.body).toBe("Hallo & Grüße");
    expect(() => gmailMail({ ...raw, id: "https://attacker.invalid" }, account)).toThrow();
  });
  it("preserves the cursor on a failed read and retries without duplicating a task", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
    const store = await service();
    let fail = false;
    let ids: string[] = [];
    const client = {
      close: vi.fn(),
      call: vi.fn(async (tool: string) => {
        if (tool === "gmail_get_profile") return { email: account };
        if (tool === "gmail_search_email_ids") {
          if (fail) throw new Error("temporär nicht erreichbar");
          return { message_ids: ids, next_page_token: null };
        }
        return message();
      }),
    };
    const gmail = new GmailConnection(store, client);
    await gmail.connect({ account, query: "in:inbox" });
    const file = join(store.directory, "gmail.json");
    const before = JSON.parse(await readFile(file, "utf8"));
    vi.setSystemTime(new Date(start.getTime() + 60000));
    fail = true;
    await expect(gmail.sync(true)).rejects.toThrow("temporär");
    expect(JSON.parse(await readFile(file, "utf8")).since).toBe(before.since);
    expect((await store.get()).connection).toMatchObject({
      provider: "gmail",
      status: "error",
      account,
    });
    fail = false;
    ids = ["abc123"];
    await gmail.sync(true);
    await gmail.sync(true);
    const state = await store.get();
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].mail.source).toBe("gmail");
    expect(state.connection.status).toBe("connected");
    await gmail.disconnect();
    expect((await store.get()).tasks).toHaveLength(1);
    expect((await store.get()).connection.status).toBe("disconnected");
  });
  it("rejects a connector that belongs to another Google account", async () => {
    const store = await service();
    const gmail = new GmailConnection(store, {
      call: async () => ({ email: "other@example.com" }),
      close() {},
    });
    await expect(gmail.connect({ account, query: "in:inbox" })).rejects.toThrow(
      "other@example.com",
    );
    expect((await store.get()).tasks).toHaveLength(0);
  });
  it("finds delayed indexing within overlapping windows, without importing older mail or duplicates", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
    const store = await service();
    let ids: string[] = [];
    const queries: string[] = [];
    const gmail = new GmailConnection(store, {
      close() {},
      async call(tool, args) {
        if (tool === "gmail_get_profile") return { email: account };
        if (tool === "gmail_search_email_ids") {
          queries.push(String(args.query));
          return { message_ids: ids };
        }
        if (args.message_id === "bbb")
          return { ...message(), id: "bbb", internal_date: String(start.getTime() - 1) };
        return message();
      },
    });
    await gmail.connect({ account, query: "in:inbox" });
    vi.setSystemTime(new Date(start.getTime() + 5 * 60_000));
    await gmail.sync(true);
    vi.setSystemTime(new Date(start.getTime() + 10 * 60_000));
    ids = ["abc123", "bbb"];
    await gmail.sync(true);
    await gmail.sync(true);
    expect(queries.at(-1)).toContain(`after:${start.getTime() / 1000 - 1}`);
    expect((await store.get()).tasks).toHaveLength(1);
    vi.setSystemTime(new Date(start.getTime() + 20 * 60_000));
    await gmail.sync(true);
    const saved = JSON.parse(await readFile(join(store.directory, "gmail.json"), "utf8"));
    expect(saved.since).toBe(new Date(start.getTime() + 10 * 60_000).toISOString());
    expect(saved.connectedAt).toBe(start.toISOString());
  });
  it("advances past an unreadable message and retries it after restart outside the search window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
    const store = await service();
    let ids: string[] = [];
    let fail = true;
    const client = {
      close() {},
      async call(tool: string, args: Record<string, unknown>) {
        if (tool === "gmail_get_profile") return { email: account };
        if (tool === "gmail_search_email_ids") return { message_ids: ids };
        if (args.message_id === "aaa" && fail) throw new Error("unlesbar");
        return { ...message(), id: String(args.message_id), thread_id: String(args.message_id) };
      },
    };
    const gmail = new GmailConnection(store, client);
    await gmail.connect({ account, query: "in:inbox" });
    vi.setSystemTime(new Date(start.getTime() + 20 * 60_000));
    ids = ["aaa", "bbb"];
    await gmail.sync(true);
    const file = join(store.directory, "gmail.json");
    expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({
      retryIds: ["aaa"],
      since: new Date(start.getTime() + 10 * 60_000).toISOString(),
    });
    expect((await store.get()).tasks).toHaveLength(1);
    expect((await store.get()).connection.status).toBe("error");
    gmail.dispose();
    const recovered = new GmailConnection(store, client);
    await recovered.initialized;
    fail = false;
    ids = ["ccc"];
    vi.setSystemTime(new Date(start.getTime() + 30 * 60_000));
    await recovered.sync(true);
    expect((await store.get()).tasks).toHaveLength(3);
    expect((await store.get()).connection.status).toBe("connected");
    expect(JSON.parse(await readFile(file, "utf8")).retryIds).toEqual([]);
  });
});
