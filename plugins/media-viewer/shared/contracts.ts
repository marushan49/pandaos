import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const mediaTypes: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

export const maxMediaBytes = 64 * 1024 * 1024;
export const mediaChunkBytes = 192 * 1024;

export const browseMedia = defineRpc({
  name: "browse",
  input: z.object({ path: z.string().max(4096) }),
  output: z.object({
    path: z.string(),
    parent: z.string(),
    entries: z.array(z.object({ name: z.string(), path: z.string(), directory: z.boolean() })),
  }),
});

export const readMedia = defineRpc({
  name: "read",
  input: z.object({
    path: z.string().min(1).max(4096),
    offset: z.number().int().min(0).max(maxMediaBytes),
    revision: z.string().optional(),
  }),
  output: z.object({
    path: z.string(),
    mimeType: z.string(),
    base64: z.string(),
    offset: z.number(),
    size: z.number(),
    revision: z.string(),
  }),
});
