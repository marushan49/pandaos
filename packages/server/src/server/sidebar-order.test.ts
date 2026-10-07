import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { SidebarOrderStore } from "./sidebar-order.js";

const order = {
  projectOrder: ["github.com/acme/repo"],
  pinnedWorkspaceOrder: ["srv_a:wks_1"],
  workspaceOrderByProject: { "github.com/acme/repo": ["srv_a:wks_1"] },
};

describe("SidebarOrderStore", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), "sidebar-order-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  test("an absent file reads as an empty order at revision 0", async () => {
    expect(await new SidebarOrderStore(home).get()).toEqual({
      revision: 0,
      projectOrder: [],
      pinnedWorkspaceOrder: [],
      workspaceOrderByProject: {},
    });
  });

  test("each write bumps the revision, persists, and notifies subscribers", async () => {
    const store = new SidebarOrderStore(home);
    const seen: number[] = [];
    store.subscribe((snapshot) => seen.push(snapshot.revision));

    const results = await Promise.all([
      store.set(order),
      store.set({ ...order, projectOrder: [] }),
    ]);

    expect(results.map((snapshot) => snapshot.revision)).toEqual([1, 2]);
    expect(seen).toEqual([1, 2]);
    const reopened = await new SidebarOrderStore(home).get();
    expect(reopened).toEqual({ ...order, projectOrder: [], revision: 2 });
    expect(JSON.parse(await readFile(path.join(home, "sidebar-order.json"), "utf8"))).toEqual(
      reopened,
    );
  });

  test("a corrupt file fails loudly instead of resetting the order", async () => {
    await writeFile(path.join(home, "sidebar-order.json"), "{not json");
    const store = new SidebarOrderStore(home);
    await expect(store.get()).rejects.toThrow();
    await expect(store.set(order)).rejects.toThrow();
    await writeFile(
      path.join(home, "sidebar-order.json"),
      JSON.stringify({ revision: 5, ...order }),
    );
    expect((await store.set(order)).revision).toBe(6);
  });
});
