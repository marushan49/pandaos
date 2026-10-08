import type { BrowserTabClose } from "@getpaseo/protocol/browser-activity/rpc-schemas";

export const TAB_CLOSE_GRACE_MS = 5 * 60_000;

export type DeferredTabClose = { status: "pending"; closesAt: number } | { status: "kept_open" };

interface ScheduledTimer {
  cancel(): void;
}

interface PendingTabClose {
  event: BrowserTabClose;
  timer: ScheduledTimer;
  close: () => Promise<unknown>;
}

export interface TabCloseGateOptions {
  isViewed: (browserId: string) => boolean;
  publish: (event: BrowserTabClose) => void;
  graceMs?: number;
  now?: () => number;
  schedule?: (run: () => void, delayMs: number) => ScheduledTimer;
}

export function describeDeferredTabClose(
  result: { browserId: string; deferredUntil?: number; keptOpen?: boolean },
  now = Date.now(),
): string | null {
  if (result.keptOpen) {
    return `The user chose to keep browser tab ${result.browserId} open, so it stays open. Do not close it again.`;
  }
  if (result.deferredUntil === undefined) return null;
  const minutes = Math.max(1, Math.round((result.deferredUntil - now) / 60_000));
  return `The user is viewing browser tab ${result.browserId} right now, so it closes in ${minutes} min instead of now. They can keep it open or close it sooner. Nothing else to do.`;
}

function scheduleUnref(run: () => void, delayMs: number): ScheduledTimer {
  const timer = setTimeout(run, delayMs);
  timer.unref?.();
  return { cancel: () => clearTimeout(timer) };
}

export class TabCloseGate {
  private readonly pending = new Map<string, PendingTabClose>();
  private readonly keptOpen = new Set<string>();
  private readonly graceMs: number;
  private readonly now: () => number;
  private readonly schedule: NonNullable<TabCloseGateOptions["schedule"]>;

  public constructor(private readonly options: TabCloseGateOptions) {
    this.graceMs = options.graceMs ?? TAB_CLOSE_GRACE_MS;
    this.now = options.now ?? Date.now;
    this.schedule = options.schedule ?? scheduleUnref;
  }

  public defer(input: {
    workspaceId: string;
    browserId: string;
    close: () => Promise<unknown>;
  }): DeferredTabClose | null {
    const { workspaceId, browserId } = input;
    if (this.keptOpen.has(browserId)) return { status: "kept_open" };
    const existing = this.pending.get(browserId);
    if (existing) return { status: "pending", closesAt: existing.event.closesAt ?? this.now() };
    if (!this.options.isViewed(browserId)) return null;
    const now = this.now();
    const event: BrowserTabClose = {
      workspaceId,
      browserId,
      status: "pending",
      closesAt: now + this.graceMs,
      updatedAt: now,
    };
    this.pending.set(browserId, {
      event,
      close: input.close,
      timer: this.schedule(() => this.closeNow(browserId), this.graceMs),
    });
    this.options.publish(event);
    return { status: "pending", closesAt: now + this.graceMs };
  }

  public keepOpen(browserId: string): boolean {
    const entry = this.take(browserId);
    if (!entry) return false;
    this.keptOpen.add(browserId);
    this.options.publish({
      workspaceId: entry.event.workspaceId,
      browserId,
      status: "kept_open",
      updatedAt: this.now(),
    });
    return true;
  }

  public closeNow(browserId: string): boolean {
    const entry = this.take(browserId);
    if (!entry) return false;
    this.publishClosed(entry.event.workspaceId, browserId);
    void entry.close().catch(() => undefined);
    return true;
  }

  public closed(input: { workspaceId: string; browserId: string }): void {
    this.take(input.browserId);
    this.keptOpen.delete(input.browserId);
    this.publishClosed(input.workspaceId, input.browserId);
  }

  public current(): BrowserTabClose[] {
    return [...this.pending.values()].map((entry) => entry.event);
  }

  private take(browserId: string): PendingTabClose | null {
    const entry = this.pending.get(browserId);
    if (!entry) return null;
    this.pending.delete(browserId);
    entry.timer.cancel();
    return entry;
  }

  private publishClosed(workspaceId: string, browserId: string): void {
    this.options.publish({ workspaceId, browserId, status: "closed", updatedAt: this.now() });
  }
}
