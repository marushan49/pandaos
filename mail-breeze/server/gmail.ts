import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { GmailClient } from "./gmail-client";
import { gmailMail } from "./gmail-mail";
import type { BreezeService } from "./service";
import type { BreezeState } from "../shared/contracts";

const SavedSchema = z.object({
  account: z.email(),
  query: z.string().min(1).max(1000),
  since: z.iso.datetime(),
  connectedAt: z.iso.datetime().optional(),
  retryIds: z.array(z.string().regex(/^[a-fA-F0-9]+$/)).default([]),
  until: z.iso.datetime().optional(),
  pageToken: z.string().optional(),
  nextReadAt: z.iso.datetime(),
  emptyReads: z.number().int().min(0).default(0),
});
const ProfileSchema = z.object({ email: z.email() });
const SearchSchema = z.object({
  message_ids: z.array(z.string().regex(/^[a-fA-F0-9]+$/)).max(25),
  next_page_token: z.string().nullable().optional(),
});
type Saved = z.infer<typeof SavedSchema>;
const minute = 60_000;

export class GmailConnection {
  readonly initialized: Promise<void>;
  private saved?: Saved;
  private syncing?: Promise<void>;
  private connecting?: Promise<BreezeState>;
  private generation = 0;
  constructor(
    private readonly service: BreezeService,
    private readonly client: Pick<GmailClient, "call" | "close"> = new GmailClient(
      service.directory,
    ),
  ) {
    this.initialized = this.load();
  }

  private async load() {
    const current = await this.service.get();
    try {
      this.saved = SavedSchema.parse(
        JSON.parse(await readFile(join(this.service.directory, "gmail.json"), "utf8")),
      );
      this.saved.connectedAt ??= this.saved.since;
      await this.service.connection({
        provider: "gmail",
        status: "connected",
        account: this.saved.account,
        lastSyncAt: current.connection.lastSyncAt,
        reader: { status: "idle", query: this.saved.query, nextReadAt: this.saved.nextReadAt },
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        await this.service.connection({
          provider: "gmail",
          status: "error",
          error:
            "Gespeicherte Gmail-Verbindung konnte nicht gelesen werden. Die vorhandene Datei wurde erhalten.",
        });
      }
    }
  }

  private async save(saved: Saved) {
    const file = join(this.service.directory, "gmail.json");
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(saved), { mode: 0o600 });
    await rename(temporary, file);
  }

  connect(input: { account: string; query: string }) {
    const operation = this.openConnection(input);
    this.connecting = operation;
    return operation.finally(() => {
      if (this.connecting === operation) this.connecting = undefined;
    });
  }

  private async openConnection(input: { account: string; query: string }) {
    await this.initialized;
    const generation = ++this.generation;
    await this.service.connection({
      provider: "gmail",
      status: "connecting",
      reader: { status: "reading", query: input.query },
    });
    try {
      if (generation !== this.generation) throw new Error("Gmail-Verbindung wurde abgebrochen.");
      const profile = ProfileSchema.parse(await this.client.call("gmail_get_profile", {}));
      if (generation !== this.generation) return this.service.get();
      if (profile.email.toLowerCase() !== input.account.toLowerCase())
        throw new Error(
          `Der verbundene Gmail-Zugang gehört zu ${profile.email}. Verwende dieses Konto oder wechsle die Gmail-Verbindung im Codex-Business-Profil.`,
        );
      const now = new Date().toISOString();
      this.saved = {
        account: profile.email,
        query: input.query,
        since: now,
        connectedAt: now,
        retryIds: [],
        nextReadAt: now,
        emptyReads: 0,
      };
      await this.save(this.saved);
      await this.sync(true);
      return this.service.get();
    } catch (error) {
      if (generation === this.generation) {
        await this.service.connection({
          provider: "gmail",
          status: "error",
          account: this.saved?.account,
          reader: this.saved
            ? { status: "error", query: this.saved.query, nextReadAt: this.saved.nextReadAt }
            : undefined,
          error: error instanceof Error ? error.message : "Gmail konnte nicht verbunden werden.",
        });
      }
      throw error;
    } finally {
      this.client.close();
    }
  }

  async sync(required = false) {
    await this.initialized;
    if (!this.saved) {
      if (required) throw new Error("Gmail ist noch nicht verbunden.");
      return;
    }
    if (this.syncing) return this.syncing;
    if (!required && Date.parse(this.saved.nextReadAt) > Date.now()) return;
    this.syncing = this.read().finally(() => {
      this.client.close();
      this.syncing = undefined;
    });
    return this.syncing;
  }

  private async read() {
    const saved = this.saved!;
    const generation = this.generation;
    const prior = (await this.service.get()).connection;
    await this.service.connection({
      provider: "gmail",
      status: "connected",
      account: saved.account,
      lastSyncAt: prior.lastSyncAt,
      reader: { status: "reading", query: saved.query, nextReadAt: saved.nextReadAt },
    });
    try {
      const profile = ProfileSchema.parse(await this.client.call("gmail_get_profile", {}));
      if (profile.email.toLowerCase() !== saved.account.toLowerCase())
        throw new Error(
          "Der Gmail-Zugang wurde auf ein anderes Konto gewechselt. Bitte Mail Breeze trennen und mit dem gewünschten Konto verbinden.",
        );
      saved.until ??= new Date().toISOString();
      await this.save(saved);
      const after = Math.floor(Date.parse(saved.since) / 1000) - 1;
      const before = Math.ceil(Date.parse(saved.until) / 1000) + 1;
      const page = SearchSchema.parse(
        await this.client.call("gmail_search_email_ids", {
          query: `(${saved.query}) after:${after} before:${before} -in:spam -in:trash -in:sent -in:draft`,
          max_results: 25,
          ...(saved.pageToken ? { next_page_token: saved.pageToken } : {}),
        }),
      );
      await this.readMessages(page.message_ids, saved, generation);
      if (generation !== this.generation) return;
      saved.pageToken = page.next_page_token || undefined;
      if (!saved.pageToken) {
        saved.since = new Date(
          Math.max(Date.parse(saved.connectedAt!), Date.parse(saved.until) - 10 * minute),
        ).toISOString();
        saved.until = undefined;
      }
      saved.emptyReads = page.message_ids.length ? 0 : saved.emptyReads + 1;
      const wait = saved.pageToken
        ? minute
        : 5 * minute * 2 ** Math.min(Math.max(saved.emptyReads - 1, 0), 2);
      saved.nextReadAt = new Date(Date.now() + wait).toISOString();
      await this.save(saved);
      await this.service.connection({
        provider: "gmail",
        status: saved.retryIds.length ? "error" : "connected",
        account: saved.account,
        error: saved.retryIds.length
          ? `${saved.retryIds.length} Gmail-Nachricht(en) konnten nicht gelesen werden und werden erneut versucht. Andere Mails werden weiter verarbeitet.`
          : undefined,
        lastSyncAt: new Date().toISOString(),
        reader: {
          status: saved.retryIds.length ? "error" : "idle",
          query: saved.query,
          nextReadAt: saved.nextReadAt,
        },
      });
      await this.service.next();
    } catch (error) {
      if (generation !== this.generation) return;
      saved.nextReadAt = new Date(Date.now() + 10 * minute).toISOString();
      await this.save(saved);
      await this.service.connection({
        provider: "gmail",
        status: "error",
        account: saved.account,
        error: error instanceof Error ? error.message : "Gmail konnte nicht gelesen werden.",
        lastSyncAt: prior.lastSyncAt,
        reader: { status: "error", query: saved.query, nextReadAt: saved.nextReadAt },
      });
      throw error;
    }
  }

  private async readMessages(ids: string[], saved: Saved, generation: number) {
    const retries = saved.retryIds.splice(0, 5);
    for (const id of new Set([...retries, ...ids])) {
      if (generation !== this.generation) return;
      try {
        const raw = await this.client.call("gmail_read_email", { message_id: id, format: "full" });
        if (generation !== this.generation) return;
        await this.importMessage(raw, saved);
        saved.retryIds = saved.retryIds.filter((pending) => pending !== id);
      } catch {
        if (!saved.retryIds.includes(id)) saved.retryIds.push(id);
        console.warn("Mail Breeze: Eine Gmail-Nachricht wird später erneut gelesen.");
      }
    }
  }

  private async importMessage(raw: unknown, saved: Saved) {
    const mail = gmailMail(raw, saved.account);
    if (
      mail &&
      Date.parse(mail.receivedAt) >= Date.parse(saved.connectedAt!) &&
      Date.parse(mail.receivedAt) <= Date.parse(saved.until!)
    )
      await this.service.import(mail, false, true);
  }

  async disconnect() {
    await this.initialized;
    this.generation += 1;
    this.saved = undefined;
    this.client.close();
    await this.connecting?.catch(() => {});
    await this.syncing?.catch(() => {});
    await unlink(join(this.service.directory, "gmail.json")).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    return this.service.connection({ provider: "gmail", status: "disconnected" });
  }

  dispose() {
    this.generation += 1;
    this.client.close();
  }
}
