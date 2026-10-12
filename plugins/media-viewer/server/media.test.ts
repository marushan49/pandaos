import { mkdtemp, writeFile, truncate, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { browse, read } from "./media.js";
import { maxMediaBytes, mediaChunkBytes } from "../shared/contracts.js";

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "pandaos-media-"));
  folders.push(directory);
  return directory;
}

test("lists pictures and videos, filters other files, and resolves the parent", async () => {
  const directory = await fixture();
  await Promise.all(
    ["photo.PNG", "clip.mp4", "notes.txt"].map((name) =>
      writeFile(path.join(directory, name), "fixture"),
    ),
  );
  const result = await browse({ path: directory });
  expect(result.entries.map((entry) => entry.name)).toEqual(["clip.mp4", "photo.PNG"]);
  expect(result.parent).toBe(path.dirname(directory));
});

test("reconstructs media across chunks without corrupting base64 padding", async () => {
  const directory = await fixture();
  const file = path.join(directory, "clip.mp4");
  const bytes = Buffer.alloc(mediaChunkBytes + 5, 137);
  await writeFile(file, bytes);
  const first = await read({ path: file, offset: 0 });
  const last = await read({ path: file, offset: first.offset, revision: first.revision });
  expect(first.offset).toBe(mediaChunkBytes);
  expect(last.offset).toBe(bytes.length);
  expect(Buffer.from(first.base64 + last.base64, "base64")).toEqual(bytes);
});

test("rejects oversized files before loading and notices changed files between chunks", async () => {
  const directory = await fixture();
  const file = path.join(directory, "clip.mp4");
  await writeFile(file, Buffer.alloc(mediaChunkBytes + 5));
  const first = await read({ path: file, offset: 0 });
  await truncate(file, maxMediaBytes + 1);
  await expect(read({ path: file, offset: 0 })).rejects.toThrow("64 MiB");
  await truncate(file, mediaChunkBytes + 6);
  await expect(
    read({ path: file, offset: first.offset, revision: first.revision }),
  ).rejects.toThrow("changed");
});

test("rejects empty, unsupported, missing and relative files", async () => {
  const directory = await fixture();
  const file = path.join(directory, "empty.png");
  await writeFile(file, "");
  await expect(read({ path: file, offset: 0 })).rejects.toThrow("empty");
  await expect(read({ path: path.join(directory, "notes.txt"), offset: 0 })).rejects.toThrow(
    "Unsupported",
  );
  await expect(read({ path: path.join(directory, "missing.png"), offset: 0 })).rejects.toThrow();
  await expect(read({ path: "relative.png", offset: 0 })).rejects.toThrow("absolute");
});
