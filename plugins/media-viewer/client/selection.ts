interface MediaSelection {
  path: string;
  revision: number;
}
const emptySelection: MediaSelection = { path: "", revision: 0 };
const paths = new Map<string, MediaSelection>();
const listeners = new Set<() => void>();

export function selectMedia(workspaceId: string, path: string) {
  paths.set(workspaceId, { path, revision: (paths.get(workspaceId)?.revision || 0) + 1 });
  for (const listener of listeners) listener();
}

export function selectedMedia(workspaceId: string): MediaSelection {
  return paths.get(workspaceId) || emptySelection;
}

export function subscribeMedia(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
