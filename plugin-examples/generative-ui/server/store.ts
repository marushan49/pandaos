import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { savedStateSchema, stateKeySchema } from "../shared/state";
import { calculate, type Values } from "../shared/surface";

type StateKey = z.output<typeof stateKeySchema>;

export class SurfaceStore {
  private writes: Promise<unknown> = Promise.resolve();
  constructor(private readonly directory: string) {}

  private path(key: StateKey) {
    return join(
      this.directory,
      `${createHash("sha256")
        .update(JSON.stringify([key.agentId, key.sourceKey, key.surface]))
        .digest("hex")}.json`,
    );
  }

  async read(key: StateKey): Promise<z.output<typeof savedStateSchema>> {
    try {
      const saved = savedStateSchema.parse(JSON.parse(await readFile(this.path(key), "utf8")));
      if (saved.values) calculate(key.surface, saved.values);
      return saved;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return { revision: 0, values: null };
      throw error;
    }
  }

  save(key: StateKey, values: Values, expectedRevision: number) {
    const operation = this.writes.then(() => this.write(key, values, expectedRevision));
    this.writes = operation.catch(() => {});
    return operation;
  }

  private async write(key: StateKey, values: Values, expectedRevision: number) {
    calculate(key.surface, values);
    const current = await this.read(key);
    if (current.revision !== expectedRevision)
      throw new Error("Saved inputs changed on another client. Reload saved inputs before saving.");
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const saved = { revision: current.revision + 1, values };
    const target = this.path(key);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(saved), { mode: 0o600, flag: "wx" });
      await rename(temporary, target);
    } finally {
      await unlink(temporary).catch((error: unknown) => {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      });
    }
    return saved;
  }
}
