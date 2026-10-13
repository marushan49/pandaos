export type ContentBlockKind = "text" | "prompt" | "rich" | "email" | "document";

const keywords: Readonly<Record<string, ContentBlockKind>> = {
  writing: "text",
  "writing-rich": "rich",
  email: "email",
  document: "document",
  prompt: "prompt",
};

export interface ContentBlockInfo {
  kind: ContentBlockKind;
  title: string | null;
}

export function parseContentBlockInfo(info: string | null | undefined): ContentBlockInfo | null {
  const trimmed = info?.trim();
  if (!trimmed) return null;

  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(trimmed);
  const kind = match ? keywords[match[1].toLowerCase()] : undefined;
  if (!match || !kind) return null;

  const title = match[2]?.trim();
  return { kind, title: title ? title : null };
}

export function isRichContentBlock(kind: ContentBlockKind): boolean {
  return kind === "rich" || kind === "email" || kind === "document";
}
