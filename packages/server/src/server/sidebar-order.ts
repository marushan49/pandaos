import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  type SidebarOrder,
  type SidebarOrderSnapshot,
  SidebarOrderSnapshotSchema,
} from "@getpaseo/protocol/messages";
import { writeJsonFileAtomic } from "./atomic-file.js";

const EMPTY_SNAPSHOT: SidebarOrderSnapshot = {
  revision: 0,
  projectOrder: [],
  pinnedWorkspaceOrder: [],
  workspaceOrderByProject: {},
};

type SidebarOrderListener = (snapshot: SidebarOrderSnapshot) => void;

export class SidebarOrderStore {
  private readonly file: string;
  private readonly listeners = new Set<SidebarOrderListener>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(paseoHome: string) {
    this.file = path.join(paseoHome, "sidebar-order.json");
  }

  get(): Promise<SidebarOrderSnapshot> {
    return this.enqueue(() => this.read());
  }

  set(order: SidebarOrder): Promise<SidebarOrderSnapshot> {
    return this.enqueue(async () => {
      const current = await this.read();
      const next: SidebarOrderSnapshot = {
        revision: current.revision + 1,
        projectOrder: order.projectOrder,
        pinnedWorkspaceOrder: order.pinnedWorkspaceOrder,
        workspaceOrderByProject: order.workspaceOrderByProject,
        // COMPAT(sidebarSnooze): added in v0.11.1, remove after 2027-04-08 once every app sends it.
        snoozedWorkspaceUntil: order.snoozedWorkspaceUntil ?? current.snoozedWorkspaceUntil,
      };
      await writeJsonFileAtomic(this.file, next);
      for (const listener of this.listeners) listener(next);
      return next;
    });
  }

  subscribe(listener: SidebarOrderListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async read(): Promise<SidebarOrderSnapshot> {
    try {
      return SidebarOrderSnapshotSchema.parse(JSON.parse(await readFile(this.file, "utf8")));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return EMPTY_SNAPSHOT;
      }
      throw error;
    }
  }
}
