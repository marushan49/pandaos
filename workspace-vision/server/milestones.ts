export interface Progress {
  open: number;
  done: number;
  blocked: string | null;
}

const BLOCKED = "BLOCKED:";

export function progressOf(text: string): Progress {
  const lines = text.split("\n");
  const open = lines.filter((line) => /^\s*[-*] \[ \]/.test(line)).length;
  const done = lines.filter((line) => /^\s*[-*] \[[xX]\]/.test(line)).length;
  const blockedLine = lines.find((line) => line.trimStart().startsWith(BLOCKED));
  const blocked = blockedLine
    ? blockedLine.trimStart().slice(BLOCKED.length).trim() || "blocked"
    : null;
  return { open, done, blocked };
}
