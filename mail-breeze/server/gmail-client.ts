import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

export const GmailReadToolSchema = z.enum([
  "gmail_get_profile",
  "gmail_search_email_ids",
  "gmail_read_email",
]);
const ReplySchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  method: z.string().optional(),
  result: z.unknown().optional(),
  error: z.object({ message: z.string() }).passthrough().optional(),
});
const ToolResultSchema = z
  .object({
    isError: z.boolean().nullish(),
    structuredContent: z.unknown().optional(),
    content: z
      .array(z.object({ type: z.string(), text: z.string().optional() }).passthrough())
      .optional(),
  })
  .passthrough();
interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export class GmailClient {
  private child?: ChildProcessWithoutNullStreams;
  private starting?: Promise<string>;
  private thread?: string;
  private serial = 0;
  private buffer = "";
  private readonly pending = new Map<number, Pending>();
  private readonly tools = new Map<string, string>();

  constructor(private readonly directory: string) {}

  private fail(error: Error) {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
    this.thread = undefined;
    this.tools.clear();
  }

  private receive(chunk: string) {
    this.buffer += chunk;
    if (this.buffer.length > 8_000_000) {
      this.close();
      return;
    }
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        continue;
      }
      const parsed = ReplySchema.safeParse(raw);
      if (!parsed.success) continue;
      const message = parsed.data;
      if (typeof message.id === "number" && !message.method) {
        const entry = this.pending.get(message.id);
        if (!entry) continue;
        this.pending.delete(message.id);
        clearTimeout(entry.timer);
        if (message.error) entry.reject(new Error(message.error.message));
        else entry.resolve(message.result);
      } else if (message.id !== undefined && message.method) {
        this.child?.stdin.write(
          JSON.stringify({
            id: message.id,
            error: {
              code: -32601,
              message: "Mail Breeze accepts no interactive tool or permission requests.",
            },
          }) + "\n",
        );
      }
    }
  }

  private rpc(method: string, params: unknown): Promise<unknown> {
    if (!this.child) return Promise.reject(new Error("Gmail-Lesezugang ist nicht gestartet."));
    return new Promise((resolve, reject) => {
      const id = ++this.serial;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Gmail antwortet nicht rechtzeitig. Bitte erneut synchronisieren."));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      this.child!.stdin.write(JSON.stringify({ id, method, params }) + "\n", (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  private async start(): Promise<string> {
    if (this.thread) return this.thread;
    if (this.starting) return this.starting;
    this.starting = this.open().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  private async open(): Promise<string> {
    const codexHome = join(homedir(), ".codex-business");
    const configText = await readFile(join(codexHome, "config.toml"), "utf8");
    const servers: Record<string, { enabled: false }> = {};
    for (const match of configText.matchAll(/^\[mcp_servers\.([a-zA-Z0-9_-]+)\]\s*$/gm)) {
      if (match[1] !== "codex_apps") servers[match[1]] = { enabled: false };
    }
    this.buffer = "";
    const child = spawn("codex", ["app-server"], {
      cwd: this.directory,
      env: { ...process.env, CODEX_HOME: codexHome },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.receive(chunk));
    child.stderr.resume();
    child.on("error", () =>
      this.fail(new Error("Der lokale Codex-Gmail-Zugang konnte nicht gestartet werden.")),
    );
    child.on("exit", () => {
      if (this.child !== child) return;
      this.child = undefined;
      this.fail(new Error("Der lokale Gmail-Lesezugang wurde beendet."));
    });
    try {
      await this.rpc("initialize", {
        clientInfo: { name: "mail_breeze", version: "0.1.0" },
        capabilities: { experimentalApi: true },
      });
      child.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
      const result = z.object({ thread: z.object({ id: z.string() }) }).parse(
        await this.rpc("thread/start", {
          cwd: this.directory,
          ephemeral: true,
          approvalPolicy: "never",
          sandbox: "read-only",
          config: { mcp_servers: servers },
        }),
      );
      this.thread = result.thread.id;
      const status = z
        .object({
          data: z.array(z.object({ name: z.string(), tools: z.record(z.string(), z.unknown()) })),
        })
        .parse(
          await this.rpc("mcpServerStatus/list", {
            threadId: this.thread,
            serverName: "codex_apps",
            detail: "toolsAndAuthOnly",
          }),
        );
      for (const name of Object.keys(
        status.data.find((server) => server.name === "codex_apps")?.tools ?? {},
      )) {
        const normalized = name.replace(/[^a-zA-Z0-9_]/g, "_");
        if (GmailReadToolSchema.safeParse(normalized).success) this.tools.set(normalized, name);
      }
      return this.thread;
    } catch (error) {
      this.close();
      throw error;
    }
  }

  async call(tool: z.infer<typeof GmailReadToolSchema>, args: Record<string, unknown>) {
    const toolName = GmailReadToolSchema.parse(tool);
    const threadId = await this.start();
    const name = this.tools.get(toolName);
    if (!name)
      throw new Error(
        "Die Gmail-Lesefunktion ist im Codex-Business-Profil nicht verfügbar. Prüfe dort die verbundene Gmail-App.",
      );
    const raw = await this.rpc("mcpServer/tool/call", {
      threadId,
      server: "codex_apps",
      tool: name,
      arguments: args,
    });
    const result = ToolResultSchema.parse(raw);
    if (result.isError)
      throw new Error(
        "Der verbundene Gmail-Zugang hat die Leseanfrage abgelehnt. Prüfe die Gmail-Verbindung im Codex-Business-Profil.",
      );
    if (result.structuredContent !== undefined) return result.structuredContent;
    for (const item of result.content ?? []) {
      if (item.type !== "text" || !item.text) continue;
      try {
        return JSON.parse(item.text) as unknown;
      } catch {
        continue;
      }
    }
    throw new Error("Gmail hat keine auswertbaren Maildaten geliefert.");
  }

  close() {
    const child = this.child;
    this.child = undefined;
    this.buffer = "";
    this.fail(new Error("Gmail-Lesezugang wurde geschlossen."));
    child?.kill();
  }
}
