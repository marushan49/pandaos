import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  RecoveryRecordSchema,
  RecoveryEventSchema,
  type RecoveryRecord,
  type RecoveryEvent,
} from "../shared/contracts";

const StateSchema = z.object({
  version: z.literal(1),
  records: z.array(RecoveryRecordSchema),
  automaticEnabled: z.boolean().default(false),
  history: z.array(RecoveryEventSchema).default([]),
});

export class RecoveryStore {
  private records = new Map<string, RecoveryRecord>();
  private automaticEnabled = false;
  private history: RecoveryEvent[] = [];
  private readonly ready: Promise<void>;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly file: string;

  constructor(private readonly directory: string) {
    this.file = join(directory, "turns.json");
    this.ready = this.load();
    void this.ready.catch(() => undefined);
  }

  private async load() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      const state = StateSchema.parse(JSON.parse(await readFile(this.file, "utf8")));
      this.records = new Map(state.records.map((record) => [record.agentId, record]));
      this.automaticEnabled = state.automaticEnabled;
      this.history = state.history;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private async exclusive<T>(operation: () => Promise<T>) {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await previous;
      await this.ready;
      return await operation();
    } finally {
      release();
    }
  }

  private async write(
    records: Map<string, RecoveryRecord>,
    enabled: boolean,
    history: RecoveryEvent[],
  ) {
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(
          JSON.stringify({
            version: 1,
            records: [...records.values()],
            automaticEnabled: enabled,
            history,
          }),
        );
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, this.file);
      const directory = await open(this.directory, "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
      this.records = records;
      this.automaticEnabled = enabled;
      this.history = history;
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }

  async all(): Promise<RecoveryRecord[]> {
    await this.ready;
    await this.tail;
    return structuredClone([...this.records.values()]);
  }

  async state() {
    await this.ready;
    await this.tail;
    return { enabled: this.automaticEnabled, history: structuredClone(this.history) };
  }

  async setAutomatic(enabled: boolean) {
    await this.exclusive(() => this.write(this.records, enabled, this.history));
  }

  async event(event: RecoveryEvent) {
    const validated = RecoveryEventSchema.parse(event);
    await this.exclusive(async () => {
      const history = [...this.history.filter((item) => item.id !== validated.id), validated]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 200);
      await this.write(this.records, this.automaticEnabled, history);
    });
  }

  async change(
    agentId: string,
    update: (current: RecoveryRecord | undefined) => RecoveryRecord | undefined,
  ) {
    await this.exclusive(async () => {
      const current = this.records.get(agentId);
      const next = update(current ? { ...current } : undefined);
      if (!next) return;
      const records = new Map(this.records);
      records.set(agentId, RecoveryRecordSchema.parse(next));
      await this.write(records, this.automaticEnabled, this.history);
    });
  }

  async flush() {
    await this.ready;
    await this.tail;
  }
}
