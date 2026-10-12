import { opendir, open, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { mediaTypes, maxMediaBytes, mediaChunkBytes } from "../shared/contracts.js";

function resolvePath(value: string): string {
  if (!value || value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\"))
    return path.resolve(homedir(), value.slice(2));
  if (!path.isAbsolute(value))
    throw new Error("Enter an absolute host path or a path starting with ~/.");
  return path.normalize(value);
}

export async function browse({ path: value }: { path: string }) {
  const directoryPath = await realpath(resolvePath(value));
  const directory = await opendir(directoryPath);
  const entries: { name: string; path: string; directory: boolean }[] = [];
  let count = 0;
  for await (const entry of directory) {
    if (++count > 10000)
      throw new Error("This folder has more than 10,000 entries. Open a smaller folder.");
    if (
      entry.isDirectory() ||
      (entry.isFile() && mediaTypes[path.extname(entry.name).toLowerCase()])
    ) {
      entries.push({
        name: entry.name,
        path: path.join(directoryPath, entry.name),
        directory: entry.isDirectory(),
      });
    }
  }
  entries.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
  return { path: directoryPath, parent: path.dirname(directoryPath), entries };
}

export async function read({
  path: value,
  offset,
  revision,
}: {
  path: string;
  offset: number;
  revision?: string;
}) {
  const filePath = resolvePath(value);
  const mimeType = mediaTypes[path.extname(filePath).toLowerCase()];
  if (!mimeType) throw new Error("Unsupported picture or video format.");
  const file = await open(filePath, "r");
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error("Choose a picture or video file.");
    if (info.size > maxMediaBytes) throw new Error("This file exceeds the 64 MiB viewer limit.");
    if (!info.size) throw new Error("This media file is empty.");
    const currentRevision = `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
    if ((offset > 0 && !revision) || (revision && revision !== currentRevision))
      throw new Error("The file changed while loading. Try again.");
    if (offset >= info.size) throw new Error("Invalid media offset.");
    const bytes = Buffer.alloc(Math.min(mediaChunkBytes, info.size - offset));
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, offset + length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const after = await file.stat();
    if (
      length !== bytes.length ||
      after.mtimeMs !== info.mtimeMs ||
      after.ctimeMs !== info.ctimeMs ||
      after.size !== info.size
    )
      throw new Error("The file changed while loading. Try again.");
    return {
      path: filePath,
      mimeType,
      base64: bytes.toString("base64"),
      offset: offset + length,
      size: info.size,
      revision: currentRevision,
    };
  } finally {
    await file.close();
  }
}
