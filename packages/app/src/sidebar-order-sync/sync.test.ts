import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SidebarOrder, SidebarOrderSnapshot } from "@getpaseo/protocol/messages";
import {
  fingerprintSidebarOrder,
  selectSidebarOrderHost,
  startSidebarOrderSync,
  type SidebarOrderSyncClient,
  type SidebarOrderSyncState,
  type SidebarOrderSyncStore,
} from "./sync";

const SERVER_ID = "srv_a";

const EMPTY: SidebarOrder = {
  projectOrder: [],
  pinnedWorkspaceOrder: [],
  workspaceOrderByProject: {},
  snoozedWorkspaceUntil: {},
};
const LOCAL: SidebarOrder = {
  projectOrder: ["p1", "p2"],
  pinnedWorkspaceOrder: ["srv_a:w1"],
  workspaceOrderByProject: { p1: ["srv_a:w1", "srv_a:w2"] },
  snoozedWorkspaceUntil: {},
};
const REMOTE: SidebarOrder = {
  projectOrder: ["p2", "p1"],
  pinnedWorkspaceOrder: [],
  workspaceOrderByProject: { p1: ["srv_a:w2", "srv_a:w1"] },
  snoozedWorkspaceUntil: { "srv_a:w2": 1_791_000_000_000 },
};

class FakeDaemon {
  snapshot: SidebarOrderSnapshot = { revision: 0, ...EMPTY };
  readonly sets: SidebarOrder[] = [];
  private readonly observers = new Set<(snapshot: SidebarOrderSnapshot) => void>();

  connect(): SidebarOrderSyncClient {
    return {
      getSidebarOrder: async () => this.snapshot,
      setSidebarOrder: async ({ baseRevision: _baseRevision, ...order }) => {
        this.sets.push(order);
        this.snapshot = { revision: this.snapshot.revision + 1, ...order };
        for (const observer of this.observers) observer(this.snapshot);
        return this.snapshot;
      },
      observeSidebarOrder: (listener) => {
        this.observers.add(listener);
        return () => this.observers.delete(listener);
      },
    };
  }
}

function createStore(initial: Partial<SidebarOrderSyncState> = {}) {
  let state: SidebarOrderSyncState = { ...EMPTY, syncMark: null, ...initial };
  const listeners = new Set<() => void>();
  const store: SidebarOrderSyncStore = {
    getState: () => state,
    setState: (partial) => {
      state = { ...state, ...partial };
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return store;
}

function orderOf(store: SidebarOrderSyncStore): SidebarOrder {
  const { syncMark: _syncMark, ...rest } = store.getState();
  return rest;
}

function start(store: SidebarOrderSyncStore, daemon: FakeDaemon, onError = vi.fn()) {
  return startSidebarOrderSync({
    serverId: SERVER_ID,
    store,
    client: daemon.connect(),
    debounceMs: 100,
    onError,
  });
}

describe("sidebar order sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("an empty host is seeded from the local order once", async () => {
    const daemon = new FakeDaemon();
    const store = createStore(LOCAL);
    const stop = start(store, daemon);
    await vi.runAllTimersAsync();

    expect(daemon.sets).toEqual([LOCAL]);
    expect(store.getState().syncMark).toEqual({
      serverId: SERVER_ID,
      revision: 1,
      fingerprint: fingerprintSidebarOrder(LOCAL),
    });
    stop();
  });

  test("a newer host order replaces the local one without writing back", async () => {
    const daemon = new FakeDaemon();
    daemon.snapshot = { revision: 3, ...REMOTE };
    const store = createStore({
      ...LOCAL,
      syncMark: { serverId: SERVER_ID, revision: 1, fingerprint: fingerprintSidebarOrder(EMPTY) },
    });
    const stop = start(store, daemon);
    await vi.runAllTimersAsync();

    expect(orderOf(store)).toEqual(REMOTE);
    expect(daemon.sets).toEqual([]);
    stop();
  });

  test("an edit on one device reaches the other and the push is not echoed", async () => {
    const daemon = new FakeDaemon();
    const mac = createStore();
    const phone = createStore();
    const stopMac = start(mac, daemon);
    const stopPhone = start(phone, daemon);
    await vi.runAllTimersAsync();

    mac.setState({ projectOrder: ["p2"] });
    mac.setState({ projectOrder: ["p2", "p1"] });
    await vi.runAllTimersAsync();

    expect(daemon.sets).toEqual([{ ...EMPTY, projectOrder: ["p2", "p1"] }]);
    expect(orderOf(phone)).toEqual({ ...EMPTY, projectOrder: ["p2", "p1"] });
    expect(phone.getState().syncMark?.revision).toBe(1);
    expect(mac.getState().syncMark?.revision).toBe(1);
    stopMac();
    stopPhone();
  });

  test("an unsent local edit wins over a push that arrives meanwhile", async () => {
    const daemon = new FakeDaemon();
    const mac = createStore();
    const phone = createStore();
    const stopMac = start(mac, daemon);
    const stopPhone = start(phone, daemon);
    await vi.runAllTimersAsync();

    phone.setState({ projectOrder: ["phone"] });
    mac.setState({ projectOrder: ["mac"] });
    await vi.runAllTimersAsync();

    expect(daemon.sets.map((set) => set.projectOrder)).toEqual([["phone"], ["mac"]]);
    expect(orderOf(mac)).toEqual({ ...EMPTY, projectOrder: ["mac"] });
    expect(orderOf(phone)).toEqual({ ...EMPTY, projectOrder: ["mac"] });
    stopMac();
    stopPhone();
  });

  test("a host whose order was reset gets the local order again", async () => {
    const daemon = new FakeDaemon();
    const store = createStore({
      ...LOCAL,
      syncMark: { serverId: SERVER_ID, revision: 7, fingerprint: fingerprintSidebarOrder(LOCAL) },
    });
    const stop = start(store, daemon);
    await vi.runAllTimersAsync();

    expect(daemon.sets).toEqual([LOCAL]);
    stop();
  });

  test("a mark from another host does not count as synced", async () => {
    const daemon = new FakeDaemon();
    const store = createStore({
      ...LOCAL,
      syncMark: { serverId: "srv_other", revision: 9, fingerprint: fingerprintSidebarOrder(LOCAL) },
    });
    const stop = start(store, daemon);
    await vi.runAllTimersAsync();

    expect(daemon.sets).toEqual([LOCAL]);
    expect(store.getState().syncMark?.serverId).toBe(SERVER_ID);
    stop();
  });

  test("a failed upload is reported and not retried in a loop", async () => {
    const daemon = new FakeDaemon();
    const client = daemon.connect();
    const onError = vi.fn();
    const store = createStore(LOCAL);
    const setSidebarOrder = vi.fn(async () => {
      throw new Error("offline");
    });
    const stop = startSidebarOrderSync({
      serverId: SERVER_ID,
      store,
      client: { ...client, setSidebarOrder },
      debounceMs: 100,
      onError,
    });
    await vi.runAllTimersAsync();

    expect(setSidebarOrder).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);

    await daemon.connect().setSidebarOrder({ ...REMOTE, baseRevision: 0 });
    await vi.runAllTimersAsync();

    expect(orderOf(store)).toEqual(REMOTE);
    expect(store.getState().syncMark?.revision).toBe(1);
    expect(setSidebarOrder).toHaveBeenCalledTimes(1);
    stop();
  });

  test("the canonical host is the smallest server id that supports the feature", () => {
    const supported = new Set(["srv_c", "srv_b"]);
    expect(selectSidebarOrderHost(["srv_c", "srv_a", "srv_b"], (id) => supported.has(id))).toBe(
      "srv_b",
    );
    expect(selectSidebarOrderHost(["srv_a"], () => false)).toBeNull();
  });

  test("a snooze on one device is uploaded and reaches the other", async () => {
    const daemon = new FakeDaemon();
    const mac = createStore();
    const phone = createStore();
    const stopMac = start(mac, daemon);
    const stopPhone = start(phone, daemon);
    await vi.runAllTimersAsync();

    phone.setState({ snoozedWorkspaceUntil: { "srv_a:w1": 1_791_000_000_000 } });
    await vi.runAllTimersAsync();

    expect(daemon.sets).toEqual([
      { ...EMPTY, snoozedWorkspaceUntil: { "srv_a:w1": 1_791_000_000_000 } },
    ]);
    expect(orderOf(mac).snoozedWorkspaceUntil).toEqual({ "srv_a:w1": 1_791_000_000_000 });
    stopMac();
    stopPhone();
  });

  test("the fingerprint ignores project key order in the workspace map", () => {
    expect(
      fingerprintSidebarOrder({ ...EMPTY, workspaceOrderByProject: { a: ["1"], b: ["2"] } }),
    ).toBe(fingerprintSidebarOrder({ ...EMPTY, workspaceOrderByProject: { b: ["2"], a: ["1"] } }));
    expect(fingerprintSidebarOrder({ ...EMPTY, snoozedWorkspaceUntil: { a: 1, b: 2 } })).toBe(
      fingerprintSidebarOrder({ ...EMPTY, snoozedWorkspaceUntil: { b: 2, a: 1 } }),
    );
    expect(fingerprintSidebarOrder({ ...EMPTY, snoozedWorkspaceUntil: { a: 1 } })).not.toBe(
      fingerprintSidebarOrder(EMPTY),
    );
  });
});
