const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function originKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = LOOPBACK_HOSTS.has(parsed.hostname) ? "loopback" : parsed.hostname;
    return `${parsed.protocol}//${host}:${parsed.port}`;
  } catch {
    return null;
  }
}

export function keepNewestPerApplication<
  T extends { browserId: string; workspaceId: string; profile: string; url: string },
>(tabs: readonly T[]): T[] {
  const newest = new Map<string, T>();
  const unparsable: T[] = [];
  for (const tab of tabs) {
    const origin = originKey(tab.url);
    if (!origin) {
      unparsable.push(tab);
      continue;
    }
    newest.set(`${tab.workspaceId}|${tab.profile}|${origin}`, tab);
  }
  return [...newest.values(), ...unparsable];
}

export function findTabForOrigin<T extends { url: string; workspaceId?: string }>(
  tabs: readonly T[],
  target: { url: string; workspaceId?: string },
): T | null {
  const origin = originKey(target.url);
  if (!origin) return null;
  return (
    tabs.find(
      (tab) =>
        (!target.workspaceId || tab.workspaceId === target.workspaceId) &&
        originKey(tab.url) === origin,
    ) ?? null
  );
}
