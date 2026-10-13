export interface TextSelection {
  start: number;
  end: number;
}

export interface EditResult {
  value: string;
  selection: TextSelection;
}

export function wrapSelection(
  value: string,
  selection: TextSelection,
  marker: string,
  placeholder: string,
): EditResult {
  const selected = value.slice(selection.start, selection.end) || placeholder;
  const before = value.slice(0, selection.start);
  const after = value.slice(selection.end);
  if (before.endsWith(marker) && after.startsWith(marker)) {
    return {
      value: before.slice(0, -marker.length) + selected + after.slice(marker.length),
      selection: {
        start: selection.start - marker.length,
        end: selection.start - marker.length + selected.length,
      },
    };
  }
  const start = selection.start + marker.length;
  return {
    value: before + marker + selected + marker + after,
    selection: { start, end: start + selected.length },
  };
}

export function toggleHeading(value: string, selection: TextSelection): EditResult {
  const lineStart = value.lastIndexOf("\n", Math.max(selection.start - 1, 0)) + 1;
  const start = selection.start === 0 ? 0 : lineStart;
  const line = value.slice(start);
  const heading = /^#{1,6} /.exec(line);
  const shift = heading ? -heading[0].length : 3;
  const next = heading
    ? value.slice(0, start) + line.slice(heading[0].length)
    : `${value.slice(0, start)}## ${line}`;
  return {
    value: next,
    selection: {
      start: Math.max(start, selection.start + shift),
      end: Math.max(start, selection.end + shift),
    },
  };
}
