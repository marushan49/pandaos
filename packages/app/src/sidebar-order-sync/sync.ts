import type { SidebarOrder, SidebarOrderSnapshot } from "@getpaseo/protocol/messages";

export interface SidebarOrderSyncMark {
  serverId: string;
  revision: number;
  fingerprint: string;
}

export interface SidebarOrderSyncState extends SidebarOrder {
  syncMark: SidebarOrderSyncMark | null;
}

export interface SidebarOrderSyncStore {
  getState: () => SidebarOrderSyncState;
  setState: (partial: Partial<SidebarOrderSyncState>) => void;
  subscribe: (listener: () => void) => () => void;
}

export interface SidebarOrderSyncClient {
  getSidebarOrder: () => Promise<SidebarOrderSnapshot>;
  setSidebarOrder: (
    input: SidebarOrder & { baseRevision: number },
  ) => Promise<SidebarOrderSnapshot>;
  observeSidebarOrder: (listener: (snapshot: SidebarOrderSnapshot) => void) => () => void;
}

export interface StartSidebarOrderSyncInput {
  serverId: string;
  store: SidebarOrderSyncStore;
  client: SidebarOrderSyncClient;
  debounceMs: number;
  onError: (error: unknown) => void;
}

const EMPTY_ORDER: SidebarOrder = {
  projectOrder: [],
  pinnedWorkspaceOrder: [],
  workspaceOrderByProject: {},
};

export function fingerprintSidebarOrder(order: SidebarOrder): string {
  const projectKeys = Object.keys(order.workspaceOrderByProject).sort();
  const workspaceOrders = projectKeys.map((key) => [key, order.workspaceOrderByProject[key]]);
  return JSON.stringify([order.projectOrder, order.pinnedWorkspaceOrder, workspaceOrders]);
}

export function selectSidebarOrderHost(
  serverIds: readonly string[],
  supportsSidebarOrder: (serverId: string) => boolean,
): string | null {
  const capable = serverIds.filter(supportsSidebarOrder).sort();
  return capable[0] ?? null;
}

function pickOrder(state: SidebarOrder): SidebarOrder {
  return {
    projectOrder: state.projectOrder,
    pinnedWorkspaceOrder: state.pinnedWorkspaceOrder,
    workspaceOrderByProject: state.workspaceOrderByProject,
  };
}

export function startSidebarOrderSync(input: StartSidebarOrderSyncInput): () => void {
  const { serverId, store, client } = input;
  let disposed = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function markFor(): SidebarOrderSyncMark | null {
    const mark = store.getState().syncMark;
    return mark?.serverId === serverId ? mark : null;
  }

  function knownRevision(): number {
    return markFor()?.revision ?? 0;
  }

  function syncedFingerprint(): string {
    return markFor()?.fingerprint ?? fingerprintSidebarOrder(EMPTY_ORDER);
  }

  function isDirty(): boolean {
    return fingerprintSidebarOrder(store.getState()) !== syncedFingerprint();
  }

  function accept(snapshot: SidebarOrderSnapshot): void {
    const order = pickOrder(snapshot);
    store.setState({
      ...order,
      syncMark: {
        serverId,
        revision: snapshot.revision,
        fingerprint: fingerprintSidebarOrder(order),
      },
    });
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void upload();
    }, input.debounceMs);
  }

  async function upload(): Promise<void> {
    if (disposed || inFlight || !isDirty()) return;
    const order = pickOrder(store.getState());
    const fingerprint = fingerprintSidebarOrder(order);
    inFlight = true;
    let failed = false;
    try {
      const snapshot = await client.setSidebarOrder({ ...order, baseRevision: knownRevision() });
      if (disposed) return;
      store.setState({ syncMark: { serverId, revision: snapshot.revision, fingerprint } });
    } catch (error) {
      failed = true;
      input.onError(error);
    } finally {
      inFlight = false;
    }
    if (!disposed && !failed && isDirty()) schedule();
  }

  function receive(snapshot: SidebarOrderSnapshot): void {
    if (disposed || inFlight || isDirty() || snapshot.revision <= knownRevision()) return;
    accept(snapshot);
  }

  const stopObserving = client.observeSidebarOrder(receive);
  const stopWatchingStore = store.subscribe(() => {
    if (!inFlight && isDirty()) schedule();
  });

  async function reconcile(): Promise<void> {
    const snapshot = await client.getSidebarOrder();
    if (disposed) return;
    if (snapshot.revision > knownRevision()) {
      accept(snapshot);
      return;
    }
    if (snapshot.revision < knownRevision()) store.setState({ syncMark: null });
    await upload();
  }

  reconcile().catch(input.onError);

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    stopObserving();
    stopWatchingStore();
  };
}
