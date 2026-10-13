export const WRITING_FENCE_KEYWORD = "writing";
export const RICH_WRITING_FENCE_KEYWORD = "writing-rich";

export interface WritingFenceInfo {
  title: string | null;
  rich: boolean;
}

export function parseWritingFenceInfo(info: string | null | undefined): WritingFenceInfo | null {
  const trimmed = info?.trim();
  if (!trimmed) return null;

  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (!match) return null;
  const keyword = match[1].toLowerCase();
  if (keyword !== WRITING_FENCE_KEYWORD && keyword !== RICH_WRITING_FENCE_KEYWORD) return null;

  const title = match[2]?.trim();
  return { title: title ? title : null, rich: keyword === RICH_WRITING_FENCE_KEYWORD };
}
