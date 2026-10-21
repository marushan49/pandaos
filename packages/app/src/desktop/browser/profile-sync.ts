import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { isWeb } from "@/constants/platform";
import {
  getDesktopHost,
  type DesktopProfileSyncCookie,
  type DesktopProfileSyncLogin,
} from "@/desktop/host";
import { useSessionStore } from "@/stores/session-store";
import { useBrowserHistoryStore } from "./store/history";

const SYNC_INTERVAL_MS = 60_000;
const FIRST_SYNC_DELAY_MS = 3_000;

const DEVICE_BOUND_SIGN_IN_DOMAINS = [
  "google.com",
  "youtube.com",
  "microsoftonline.com",
  "live.com",
  "microsoft.com",
  "cloud.microsoft",
  "office.com",
  "office365.com",
  "outlook.com",
  "sharepoint.com",
  "apple.com",
  "icloud.com",
];

function isSyncableCookie(cookie: CookieKey): boolean {
  const host = cookie.domain.replace(/^\./, "");
  return !DEVICE_BOUND_SIGN_IN_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

type CookieKey = Pick<DesktopProfileSyncCookie, "name" | "domain" | "path">;

function cookieKey(cookie: CookieKey): string {
  return `${cookie.domain}\t${cookie.path}\t${cookie.name}`;
}

function sameCookie(a: DesktopProfileSyncCookie, b: DesktopProfileSyncCookie): boolean {
  return a.value === b.value && a.expires === b.expires;
}

function toKey(cookie: CookieKey): CookieKey {
  return { name: cookie.name, domain: cookie.domain, path: cookie.path };
}

export function diffLocalCookies(
  previous: ReadonlyMap<string, DesktopProfileSyncCookie> | null,
  local: readonly DesktopProfileSyncCookie[],
): { upserts: DesktopProfileSyncCookie[]; removed: CookieKey[] } {
  if (!previous) return { upserts: [], removed: [] };
  const localKeys = new Set(local.map(cookieKey));
  return {
    upserts: local.filter((cookie) => {
      const known = previous.get(cookieKey(cookie));
      return !known || !sameCookie(known, cookie);
    }),
    removed: [...previous.values()]
      .filter((cookie) => !localKeys.has(cookieKey(cookie)))
      .map(toKey),
  };
}

function assumeHostCookies(
  previous: ReadonlyMap<string, DesktopProfileSyncCookie> | null,
  upserts: readonly DesktopProfileSyncCookie[],
  removed: readonly CookieKey[],
): DesktopProfileSyncCookie[] {
  const next = new Map(previous ?? []);
  for (const key of removed) next.delete(cookieKey(key));
  for (const cookie of upserts) next.set(cookieKey(cookie), cookie);
  return [...next.values()];
}

export function planLocalApply(input: {
  previous: ReadonlyMap<string, DesktopProfileSyncCookie> | null;
  hostCookies: readonly DesktopProfileSyncCookie[];
  local: readonly DesktopProfileSyncCookie[];
  upserts: readonly DesktopProfileSyncCookie[];
}): {
  upserts: DesktopProfileSyncCookie[];
  removed: CookieKey[];
  missingOnHost: DesktopProfileSyncCookie[];
} {
  const localMap = new Map(input.local.map((cookie) => [cookieKey(cookie), cookie]));
  const hostKeys = new Set(input.hostCookies.map(cookieKey));
  const pushed = new Set(input.upserts.map(cookieKey));
  const upserts = input.hostCookies.filter((cookie) => {
    if (pushed.has(cookieKey(cookie))) return false;
    const current = localMap.get(cookieKey(cookie));
    return !current || !sameCookie(current, cookie);
  });
  if (!input.previous) {
    return {
      upserts,
      removed: [],
      missingOnHost: input.local.filter((cookie) => !hostKeys.has(cookieKey(cookie))),
    };
  }
  const removed = [...input.previous.values()]
    .filter((cookie) => !hostKeys.has(cookieKey(cookie)) && localMap.has(cookieKey(cookie)))
    .filter((cookie) => !pushed.has(cookieKey(cookie)))
    .map(toKey);
  return { upserts, removed, missingOnHost: [] };
}

interface LocalProfile {
  cookies: DesktopProfileSyncCookie[];
  logins: DesktopProfileSyncLogin[];
}

export function mountBrowserProfileSync(client: DaemonClient, serverId: string): () => void {
  const bridge = getDesktopHost()?.browser;
  const profileSync = bridge?.profileSync;
  let stopped = false;
  let running = false;
  let pending = false;
  let synced: Map<string, DesktopProfileSyncCookie> | null = null;
  let hostVersion: string | undefined;

  const supported = () => {
    const serverInfo = useSessionStore.getState().sessions[serverId]?.serverInfo;
    return serverInfo?.features?.browserProfileSync === true && serverInfo.desktopManaged !== true;
  };

  async function syncHistory() {
    const entries = useBrowserHistoryStore.getState().entriesByServerId[serverId] ?? [];
    const result = await client.syncBrowserProfile({ history: { entries: [...entries] } });
    if (!result.error && result.history) {
      useBrowserHistoryStore.getState().replaceHistory(serverId, result.history);
    }
  }

  async function syncLocalProfile() {
    if (!profileSync) return;
    const local = (await profileSync({ action: "read" })) as LocalProfile;
    const localCookies = local.cookies.filter(isSyncableCookie);
    const previous = synced;
    const { upserts, removed } = diffLocalCookies(previous, localCookies);
    const result = await client.syncBrowserProfile({
      cookies: { upserts, removed },
      wantCookies: true,
      ...(previous && hostVersion ? { knownCookieVersion: hostVersion } : {}),
      logins: local.logins,
      wantLogins: true,
    });
    if (result.error) throw new Error(result.error);
    hostVersion = result.cookieVersion;
    const hostCookies = (result.cookies ?? assumeHostCookies(previous, upserts, removed)).filter(
      isSyncableCookie,
    );
    const plan = planLocalApply({ previous, hostCookies, local: localCookies, upserts });
    const logins = result.logins ?? [];
    if (plan.upserts.length > 0 || plan.removed.length > 0 || logins.length > 0) {
      await profileSync({ action: "apply", upserts: plan.upserts, removed: plan.removed, logins });
    }
    synced = new Map(hostCookies.map((cookie) => [cookieKey(cookie), cookie]));
    if (plan.missingOnHost.length === 0) return;
    const followUp = await client.syncBrowserProfile({
      cookies: { upserts: plan.missingOnHost, removed: [] },
      wantCookies: true,
    });
    if (followUp.error) throw new Error(followUp.error);
    hostVersion = followUp.cookieVersion;
    for (const cookie of plan.missingOnHost) synced.set(cookieKey(cookie), cookie);
  }

  async function run() {
    if (stopped || !supported()) return;
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      await syncHistory();
      await syncLocalProfile();
    } catch (error) {
      console.warn("[browser-profile-sync] sync failed", error);
      return;
    } finally {
      running = false;
    }
    if (pending) {
      pending = false;
      void run();
    }
  }

  const trigger = () => void run();
  const firstTimer = setTimeout(trigger, FIRST_SYNC_DELAY_MS);
  const interval = setInterval(trigger, SYNC_INTERVAL_MS);
  const unsubscribeChanges = bridge?.onProfileChanged?.(trigger);
  if (isWeb) window.addEventListener("focus", trigger);
  return () => {
    stopped = true;
    clearTimeout(firstTimer);
    clearInterval(interval);
    unsubscribeChanges?.();
    if (isWeb) window.removeEventListener("focus", trigger);
  };
}
