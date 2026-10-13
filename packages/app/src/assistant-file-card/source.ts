import { isAbsolutePath } from "@/utils/path";

const cardExtensions = new Set([
  "eml",
  "msg",
  "ics",
  "vcf",
  "pdf",
  "doc",
  "docx",
  "odt",
  "rtf",
  "pages",
  "xls",
  "xlsx",
  "ods",
  "csv",
  "numbers",
  "ppt",
  "pptx",
  "odp",
  "key",
  "epub",
  "zip",
  "tar",
  "gz",
  "tgz",
  "7z",
  "apk",
  "aab",
  "ipa",
  "dmg",
  "pkg",
  "mp3",
  "wav",
  "m4a",
]);

export function assistantFileCardPath(href: string): string | null {
  let value = href.trim();
  if (/^file:\/\//i.test(value)) {
    try {
      value = decodeURIComponent(new URL(value).pathname);
    } catch {
      return null;
    }
    if (/^\/[a-z]:\//i.test(value)) value = value.slice(1);
  } else {
    try {
      value = decodeURI(value);
    } catch {
      return null;
    }
  }
  if (!isAbsolutePath(value)) return null;
  const extension = /\.([a-z\d]+)$/i.exec(value)?.[1]?.toLowerCase();
  return extension && cardExtensions.has(extension) ? value : null;
}

export function splitHostFilePath(path: string): { directory: string; fileName: string } {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return {
    directory: index <= 0 ? path.slice(0, index + 1) || "/" : path.slice(0, index),
    fileName: path.slice(index + 1),
  };
}
