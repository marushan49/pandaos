import {
  BrowserScreencastOpcode,
  encodeBrowserScreencastFrame,
  type BrowserScreencastBinaryFrame,
} from "@getpaseo/protocol/binary-frames/index";
import { BrowserToolsRequestError } from "../../browser-tools/errors.js";
import type { SessionInboundMessage, SessionOutboundMessage } from "../../messages.js";
import type { DaemonPlaywrightHost, ScreencastFrame } from "../../verify/playwright-host.js";
import type { SessionDelivery } from "../owned-subscriptions/index.js";
import type { BrowserScreencastQuality } from "@getpaseo/protocol/browser-screencast/rpc-schemas";

// Chromium only sends a frame when the page repaints, so the cap costs nothing while
// idle; at 12 a trackpad scroll visibly stepped.
export const SCREENCAST_MAX_FPS = 30;

interface ScreencastPreset {
  maxFps: number;
  jpegQuality: number;
  maxWidth?: number;
  maxHeight?: number;
}

export const SCREENCAST_PRESETS: Record<BrowserScreencastQuality, ScreencastPreset> = {
  smooth: { maxFps: SCREENCAST_MAX_FPS, jpegQuality: 60, maxWidth: 1920, maxHeight: 1920 },
  sharp: { maxFps: SCREENCAST_MAX_FPS, jpegQuality: 90 },
  saver: { maxFps: 10, jpegQuality: 50, maxWidth: 960 },
};
// Two frames in flight hide one round trip without letting a slow link build a backlog.
export const SCREENCAST_MAX_UNACKED_FRAMES = 2;
const MAX_SCREENCAST_SLOTS = 256;

interface ScreencastPacerOptions<T> {
  send(frame: T, sequence: number): Promise<void>;
  minIntervalMs: number;
  maxUnacked: number;
  onAckLatency?(latencyMs: number): void;
}

// ponytail: fixed thresholds on the ack round trip; a bandwidth estimate from frame bytes
// over ack time would pick the tier per link instead of flipping between two.
export const SCREENCAST_SLOW_ACK_MS = 200;
export const SCREENCAST_FAST_ACK_MS = 80;
const SCREENCAST_ADAPT_SAMPLES = 5;
const SCREENCAST_RESTORE_AFTER_MS = 15_000;

type LinkTier = "full" | "lean";

/** Picks the lean tier while the viewer's acks come back slowly, the full one again once they are fast. */
export class ScreencastLinkMonitor {
  private average: number | null = null;
  private samples = 0;
  private tier: LinkTier = "full";
  private tierSince = 0;

  constructor(private readonly onChange: (tier: LinkTier) => void) {}

  record(latencyMs: number, now: number): void {
    this.average = this.average === null ? latencyMs : this.average * 0.7 + latencyMs * 0.3;
    this.samples += 1;
    if (this.samples < SCREENCAST_ADAPT_SAMPLES) return;
    if (this.tier === "full" && this.average > SCREENCAST_SLOW_ACK_MS) this.switchTo("lean", now);
    else if (
      this.tier === "lean" &&
      this.average < SCREENCAST_FAST_ACK_MS &&
      now - this.tierSince >= SCREENCAST_RESTORE_AFTER_MS
    )
      this.switchTo("full", now);
  }

  private switchTo(tier: LinkTier, now: number): void {
    this.tier = tier;
    this.tierSince = now;
    this.samples = 0;
    this.onChange(tier);
  }
}

/**
 * Latest frame wins. A frame goes out only when the previous write finished, fewer than
 * maxUnacked frames await the viewer's ack, and minIntervalMs passed since the last send.
 * The first frame after an idle period goes out immediately; a trailing timer sends the last one.
 */
export class ScreencastPacer<T> {
  private latest: T | null = null;
  private sent = 0;
  private acked = 0;
  private writing = false;
  private paused = true;
  private stopped = false;
  private nextSendAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly sentAt = new Map<number, number>();

  constructor(private readonly options: ScreencastPacerOptions<T>) {}

  push(frame: T): void {
    this.latest = frame;
    this.pump();
  }

  resume(): void {
    this.paused = false;
    this.pump();
  }

  ack(sequence: number): void {
    if (sequence <= this.acked || sequence > this.sent) return;
    this.acked = sequence;
    const sentAt = this.sentAt.get(sequence);
    for (const pending of this.sentAt.keys()) if (pending <= sequence) this.sentAt.delete(pending);
    if (sentAt !== undefined) this.options.onAckLatency?.(Date.now() - sentAt);
    this.pump();
  }

  stop(): void {
    this.stopped = true;
    this.latest = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private pump(): void {
    const isBlocked = this.paused || this.stopped || this.writing || this.timer !== null;
    const isWindowFull = this.sent - this.acked >= this.options.maxUnacked;
    if (isBlocked || isWindowFull || this.latest === null) return;
    const wait = this.nextSendAt - Date.now();
    if (wait > 0) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.pump();
      }, wait);
      return;
    }
    const frame = this.latest;
    this.latest = null;
    this.writing = true;
    this.sent += 1;
    this.sentAt.set(this.sent, Date.now());
    this.nextSendAt = Date.now() + this.options.minIntervalMs;
    void this.options.send(frame, this.sent).finally(() => {
      this.writing = false;
      this.pump();
    });
  }
}

interface ActiveScreencast {
  source: object;
  pacer: ScreencastPacer<ScreencastFrame>;
}

export interface BrowserScreencastSessionOptions {
  host: Pick<DaemonPlaywrightHost, "startScreencast"> | null | undefined;
  emit: (message: SessionOutboundMessage) => void;
}

/** One pacer per viewer subscription; frames and acks share the subscription's binary slot. */
export class BrowserScreencastSession {
  private readonly streams = new Map<number, ActiveScreencast>();
  private nextSlot = 0;

  constructor(private readonly options: BrowserScreencastSessionOptions) {}

  async subscribe(
    request: Extract<SessionInboundMessage, { type: "browser.screencast.subscribe.request" }>,
    delivery: SessionDelivery,
  ): Promise<void> {
    const { requestId, workspaceId, browserId } = request;
    const preset = SCREENCAST_PRESETS[request.quality ?? "smooth"];
    const fail = (error: string) =>
      this.options.emit({
        type: "browser.screencast.subscribe.response",
        payload: { requestId, browserId, error },
      });
    const host = this.options.host;
    if (!host) return fail("Remote browser hosting is unavailable.");
    const slot = this.allocateSlot();
    if (slot === null) return fail("No browser screencast slots available.");

    let stop: (() => Promise<void>) | null = null;
    const lean = SCREENCAST_PRESETS.saver;
    const adapts = preset.jpegQuality > lean.jpegQuality;
    const monitor = new ScreencastLinkMonitor((tier) => {
      void restart(tier === "lean" ? lean : preset);
    });
    const pacer = new ScreencastPacer<ScreencastFrame>({
      minIntervalMs: 1000 / preset.maxFps,
      maxUnacked: SCREENCAST_MAX_UNACKED_FRAMES,
      ...(adapts ? { onAckLatency: (latencyMs) => monitor.record(latencyMs, Date.now()) } : {}),
      send: (frame, sequence) =>
        owner.emitBinary(
          encodeBrowserScreencastFrame({
            slot,
            sequence,
            width: frame.width,
            height: frame.height,
            payload: Buffer.from(frame.dataBase64, "base64"),
          }),
        ),
    });
    const owner = delivery.begin(
      "browser-screencast",
      undefined,
      async () => {
        pacer.stop();
        this.streams.delete(slot);
        await stop?.();
      },
      `browser-screencast:${browserId}`,
    );
    this.streams.set(slot, { source: owner.source, pacer });
    const onEnd = () => {
      owner.emit({ type: "browser.screencast.ended", payload: { browserId } });
      void owner.release();
    };
    const start = (params: ScreencastPreset) =>
      host.startScreencast({
        workspaceId,
        browserId,
        jpegQuality: params.jpegQuality,
        ...(params.maxWidth ? { maxWidth: params.maxWidth } : {}),
        ...(params.maxHeight ? { maxHeight: params.maxHeight } : {}),
        onFrame: (frame) => pacer.push(frame),
        onEnd,
      });
    const restart = async (params: ScreencastPreset) => {
      if (owner.signal.aborted || !stop) return;
      const previous = stop;
      stop = null;
      await previous();
      if (owner.signal.aborted) return;
      try {
        const next = await start(params);
        if (owner.signal.aborted) await next();
        else stop = next;
      } catch {
        void owner.release();
      }
    };
    try {
      stop = await start(preset);
    } catch (error) {
      await owner.release();
      if (error instanceof BrowserToolsRequestError) return fail(error.message);
      throw error;
    }
    if (owner.signal.aborted) {
      await stop?.();
      return;
    }
    this.options.emit({
      type: "browser.screencast.subscribe.response",
      payload: { requestId, browserId, subscriptionId: owner.responseId, slot, error: null },
    });
    // Frames wait for the response so the viewer has the slot before its first frame.
    pacer.resume();
  }

  handleFrame(frame: BrowserScreencastBinaryFrame, source: object): void {
    if (frame.opcode !== BrowserScreencastOpcode.Ack) return;
    const stream = this.streams.get(frame.slot);
    if (stream?.source === source) stream.pacer.ack(frame.sequence);
  }

  private allocateSlot(): number | null {
    for (let offset = 0; offset < MAX_SCREENCAST_SLOTS; offset += 1) {
      const slot = (this.nextSlot + offset) % MAX_SCREENCAST_SLOTS;
      if (!this.streams.has(slot)) {
        this.nextSlot = (slot + 1) % MAX_SCREENCAST_SLOTS;
        return slot;
      }
    }
    return null;
  }
}
