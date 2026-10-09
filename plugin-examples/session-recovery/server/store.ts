import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { RecoveryRecordSchema, type RecoveryRecord } from "../shared/contracts";

const StateSchema = z.object({ version: z.literal(1), records: z.array(RecoveryRecordSchema) });

export class RecoveryStore {
  private records = new Map<string, RecoveryRecord>();
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
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async all(): Promise<RecoveryRecord[]> {
    await this.ready;
    await this.tail;
    return structuredClone([...this.records.values()]);
  }

  async change(
    agentId: string,
    update: (current: RecoveryRecord | undefined) => RecoveryRecord | undefined,
  ) {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await previous;
      await this.ready;
      const current = this.records.get(agentId);
      const next = update(current ? { ...current } : undefined);
      if (!next) return;
      RecoveryRecordSchema.parse(next);
      const records = new Map(this.records);
      records.set(agentId, next);
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try {
        const handle = await open(temporary, "wx", 0o600);
        try {
          await handle.writeFile(JSON.stringify({ version: 1, records: [...records.values()] }));
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
      } finally {
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
    } finally {
      release();
    }
  }

  async flush() {
    await this.ready;
    await this.tail;
  }
}
