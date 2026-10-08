const VISIBLE_LINES_COMPACT = 6;
const VISIBLE_LINES_DESKTOP = 10;
const MIN_HIDDEN_LINES = 2;
const MIN_CHARS_PER_LINE = 15;

export function getPromptVisibleLines(isCompact: boolean): number {
  return isCompact ? VISIBLE_LINES_COMPACT : VISIBLE_LINES_DESKTOP;
}

export function mayNeedPromptCollapse(message: string, visibleLines: number): boolean {
  const collapseAtLines = visibleLines + MIN_HIDDEN_LINES;
  if (message.length > collapseAtLines * MIN_CHARS_PER_LINE) {
    return true;
  }
  let lines = 1;
  for (let index = message.indexOf("\n"); index !== -1; index = message.indexOf("\n", index + 1)) {
    lines += 1;
    if (lines >= collapseAtLines) {
      return true;
    }
  }
  return false;
}

export function countPromptLines(input: {
  fullHeight: number;
  clampedHeight: number;
  visibleLines: number;
}): number {
  const { fullHeight, clampedHeight, visibleLines } = input;
  if (fullHeight <= 0 || clampedHeight <= 0) {
    return 0;
  }
  return Math.max(visibleLines, Math.round((visibleLines * fullHeight) / clampedHeight));
}

export function shouldCollapsePrompt(totalLines: number, visibleLines: number): boolean {
  return totalLines >= visibleLines + MIN_HIDDEN_LINES;
}
