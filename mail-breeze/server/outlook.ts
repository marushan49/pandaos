import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { BreezeService } from "./service";

const TokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
});
const CredentialsSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
  cursor: z.string(),
  account: z.string(),
  tenant: z.string(),
  clientId: z.string(),
});
const DeviceSchema = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri: z.url(),
  expires_in: z.number(),
  interval: z.number().default(5),
});
const GraphMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string().optional(),
  subject: z.string().optional(),
  from: z
    .object({
      emailAddress: z.object({ name: z.string().optional(), address: z.string().optional() }),
    })
    .optional(),
  body: z.object({ content: z.string(), contentType: z.string().optional() }).optional(),
  bodyPreview: z.string().optional(),
  receivedDateTime: z.string().optional(),
  webLink: z.string().optional(),
  "@removed": z.unknown().optional(),
});
const PageSchema = z.object({
  value: z.array(GraphMessageSchema),
  "@odata.nextLink": z.string().optional(),
  "@odata.deltaLink": z.string().optional(),
});
type Credentials = z.infer<typeof CredentialsSchema>;
const scopes =
  "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read offline_access";

async function request(
  url: string | URL,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  } = {},
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 20000);
  try {
    return await fetch(url.toString(), { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}

export class OutlookConnection {
  private auth?: AbortController;
  private login?: Promise<void>;
  private credentials?: Credentials;
  private syncing?: Promise<void>;
  private readonly ready: Promise<void>;

  constructor(private readonly service: BreezeService) {
    this.ready = this.load();
  }

  private async load() {
    await this.service.get();
    try {
      this.credentials = CredentialsSchema.parse(
        JSON.parse(await readFile(join(this.service.directory, "outlook.json"), "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        await this.service.connection({
          status: "error",
          error: "Gespeicherte Outlook-Anmeldung konnte nicht gelesen werden. Bitte neu verbinden.",
        });
    }
  }

  private async save() {
    const file = join(this.service.directory, "outlook.json");
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(this.credentials), { mode: 0o600 });
    await rename(temporary, file);
  }

  private async token(tenant: string, body: Record<string, string>, signal?: AbortSignal) {
    const response = await request(
      `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body).toString(),
        signal,
      },
    );
    const data: unknown = await response.json();
    if (!response.ok) {
      const failure = z
        .object({ error: z.string(), error_description: z.string().optional() })
        .parse(data);
      return {
        error: failure.error,
        detail: failure.error_description?.split("\n")[0].slice(0, 600) || failure.error,
      };
    }
    return { token: TokenSchema.parse(data) };
  }

  async begin() {
    await this.ready;
    const { preferences } = await this.service.get();
    if (this.credentials)
      throw new Error(
        "Trenne zuerst die bestehende Outlook-Verbindung, bevor du ein Konto neu anmeldest.",
      );
    if (!preferences.clientId)
      throw new Error(
        "Outlook ist noch nicht eingerichtet. Öffne die Einrichtung im Outlook-Tab, bevor du dich anmeldest.",
      );
    this.auth?.abort();
    const controller = new AbortController();
    this.auth = controller;
    const response = await request(
      `https://login.microsoftonline.com/${encodeURIComponent(preferences.tenant)}/oauth2/v2.0/devicecode`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: preferences.clientId, scope: scopes }).toString(),
        signal: controller.signal,
      },
    );
    if (!response.ok)
      throw new Error(
        `Microsoft-Anmeldung konnte nicht gestartet werden (${response.status}). Prüfe Client-ID und öffentliche Clientflows.`,
      );
    const device = DeviceSchema.parse(await response.json());
    await this.service.connection({ status: "connecting" });
    const expiresAt = Date.now() + device.expires_in * 1000;
    this.login = this.complete(device, preferences, expiresAt, controller).catch(async (error) => {
      if (!controller.signal.aborted)
        await this.service.connection({
          status: "error",
          error: error instanceof Error ? error.message : "Outlook-Anmeldung fehlgeschlagen.",
        });
    });
    return {
      userCode: device.user_code,
      verificationUri: device.verification_uri,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  private async complete(
    device: z.infer<typeof DeviceSchema>,
    preferences: { clientId: string; tenant: string },
    expiresAt: number,
    controller: AbortController,
  ) {
    let interval = Math.max(5, device.interval);
    while (Date.now() < expiresAt) {
      await delay(interval * 1000, undefined, { signal: controller.signal });
      const result = await this.token(
        preferences.tenant,
        {
          client_id: preferences.clientId,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: device.device_code,
        },
        controller.signal,
      );
      if (result.error === "authorization_pending") continue;
      if (result.error === "slow_down") {
        interval += 5;
        continue;
      }
      if (!result.token) throw new Error(result.detail || "Anmeldung wurde abgebrochen.");
      if (!result.token.refresh_token)
        throw new Error(
          "Microsoft hat keinen dauerhaften Zugriff erteilt. Bitte offline_access zulassen.",
        );
      const profileResponse = await request(
        "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName",
        {
          headers: { Authorization: `Bearer ${result.token.access_token}` },
          signal: controller.signal,
        },
      );
      if (!profileResponse.ok)
        throw new Error("Microsoft-Profil konnte nicht gelesen werden. Bitte erneut verbinden.");
      const profile = z
        .object({ mail: z.string().nullable().optional(), userPrincipalName: z.string() })
        .parse(await profileResponse.json());
      const cursor = new URL(
        "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta",
      );
      cursor.searchParams.set(
        "$select",
        "id,conversationId,subject,from,body,bodyPreview,receivedDateTime,webLink",
      );
      cursor.searchParams.set("$filter", `receivedDateTime ge ${new Date().toISOString()}`);
      if (controller.signal.aborted) return;
      this.credentials = {
        accessToken: result.token.access_token,
        refreshToken: result.token.refresh_token,
        expiresAt: Date.now() + result.token.expires_in * 1000,
        cursor: cursor.toString(),
        account: profile.mail || profile.userPrincipalName,
        clientId: preferences.clientId,
        tenant: preferences.tenant,
      };
      await this.save();
      await this.service.connection({ status: "connected", account: this.credentials.account });
      await this.sync();
      return;
    }
    throw new Error("Anmeldecode abgelaufen. Bitte erneut verbinden.");
  }

  async disconnect() {
    await this.ready;
    this.auth?.abort();
    await this.login;
    await this.syncing?.catch(() => {});
    this.credentials = undefined;
    await unlink(join(this.service.directory, "outlook.json")).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    return this.service.connection({ status: "disconnected" });
  }

  async sync(required = false) {
    await this.ready;
    if (!this.credentials) {
      if (required) throw new Error("Outlook ist noch nicht verbunden.");
      return;
    }
    if (this.syncing) return this.syncing;
    this.syncing = this.readMessages().finally(() => {
      this.syncing = undefined;
    });
    return this.syncing;
  }

  private async readMessages() {
    const credentials = this.credentials!;
    try {
      if (credentials.expiresAt < Date.now() + 60000) {
        const result = await this.token(credentials.tenant, {
          client_id: credentials.clientId,
          grant_type: "refresh_token",
          refresh_token: credentials.refreshToken,
          scope: scopes,
        });
        if (!result.token)
          throw new Error(
            "Microsoft-Anmeldung ist abgelaufen oder wurde widerrufen. Bitte neu verbinden.",
          );
        credentials.accessToken = result.token.access_token;
        credentials.refreshToken = result.token.refresh_token || credentials.refreshToken;
        credentials.expiresAt = Date.now() + result.token.expires_in * 1000;
        await this.save();
      }
      for (let page = 0; page < 4; page++) {
        const url = new URL(credentials.cursor);
        if (url.origin !== "https://graph.microsoft.com" || !url.pathname.startsWith("/v1.0/"))
          throw new Error("Ungültige Microsoft-Fortsetzungsadresse.");
        const response = await request(url, {
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            Prefer: 'outlook.body-content-type="text", odata.maxpagesize=25',
          },
        });
        if (!response.ok)
          throw new Error(
            response.status === 410
              ? "Microsoft-Synchronisierung abgelaufen. Bitte Outlook neu verbinden."
              : `Outlook konnte nicht gelesen werden (${response.status}).`,
          );
        const data = PageSchema.parse(await response.json());
        for (const message of data.value) await this.importMessage(message, credentials.account);
        const next = data["@odata.nextLink"] || data["@odata.deltaLink"];
        if (!next) throw new Error("Microsoft hat keine Fortsetzungsadresse geliefert.");
        credentials.cursor = next;
        await this.save();
        if (!data["@odata.nextLink"]) break;
      }
      await this.service.connection({
        status: "connected",
        account: credentials.account,
        lastSyncAt: new Date().toISOString(),
      });
      await this.service.next();
    } catch (error) {
      await this.service.connection({
        status: "error",
        account: credentials.account,
        error:
          error instanceof Error ? error.message : "Outlook konnte nicht synchronisiert werden.",
      });
      throw error;
    }
  }

  private async importMessage(message: z.infer<typeof GraphMessageSchema>, account: string) {
    if (message["@removed"] || !message.receivedDateTime) return;
    const content = message.body?.content || message.bodyPreview || "";
    if (!content.trim()) return;
    await this.service.import(
      {
        source: "outlook",
        id: message.id,
        conversationId: `${account}:${message.conversationId || message.id}`,
        subject: (message.subject?.trim() || "Mail ohne Betreff").slice(0, 1000),
        sender:
          message.from?.emailAddress.name || message.from?.emailAddress.address || "Unbekannt",
        senderEmail: message.from?.emailAddress.address || "",
        body: content.slice(0, 40000),
        receivedAt: message.receivedDateTime,
        ...(message.webLink ? { webLink: message.webLink } : {}),
      },
      false,
      true,
    );
  }

  dispose() {
    this.auth?.abort();
  }
}
