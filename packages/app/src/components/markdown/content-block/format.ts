import MarkdownIt from "markdown-it";

const parser = new MarkdownIt({ html: false, linkify: true, breaks: true });
type Token = ReturnType<MarkdownIt["parse"]>[number];

const cellStyle = "border:1px solid #c8c8c8;padding:6px 8px;text-align:left;vertical-align:top";

export function contentBlockHtml(markdown: string): string {
  return parser
    .render(markdown)
    .replace(/<table>/g, '<table style="border-collapse:collapse">')
    .replace(/<th(?=[\s>])/g, `<th style="${cellStyle};background:#eef2f7"`)
    .replace(/<td(?=[\s>])/g, `<td style="${cellStyle}"`);
}

function inlineText(tokens: Token[]): string {
  let text = "";
  let link: { href: string; start: number } | null = null;
  for (const token of tokens) {
    if (token.type === "text" || token.type === "code_inline") text += token.content;
    else if (token.type === "softbreak" || token.type === "hardbreak") text += "\n";
    else if (token.type === "image") text += token.content;
    else if (token.type === "link_open")
      link = { href: token.attrGet("href") ?? "", start: text.length };
    else if (token.type === "link_close" && link) {
      const label = text.slice(link.start);
      const href = link.href.replace(/^mailto:/, "");
      if (href && href !== label) text += ` (${link.href})`;
      link = null;
    }
  }
  return text;
}

interface PlainTextState {
  lines: string[];
  lists: { ordered: boolean; next: number }[];
  prefix: string | null;
  cells: string[] | null;
}

function openListItem(state: PlainTextState): void {
  const list = state.lists[state.lists.length - 1];
  const marker = list?.ordered ? `${list.next++}. ` : "- ";
  state.prefix = "  ".repeat(Math.max(state.lists.length - 1, 0)) + marker;
}

function closeList(state: PlainTextState): void {
  state.lists.pop();
  if (state.lists.length === 0) state.lines.push("");
}

function addInline(state: PlainTextState, token: Token): void {
  const text = inlineText(token.children ?? []);
  if (state.cells) {
    state.cells.push(text);
    return;
  }
  state.lines.push((state.prefix ?? "") + text);
  state.prefix = null;
}

const plainTextHandlers: Partial<Record<string, (state: PlainTextState, token: Token) => void>> = {
  bullet_list_open: (state) => state.lists.push({ ordered: false, next: 1 }),
  ordered_list_open: (state, token) =>
    state.lists.push({ ordered: true, next: Number(token.attrGet("start") ?? 1) }),
  bullet_list_close: closeList,
  ordered_list_close: closeList,
  list_item_open: openListItem,
  tr_open: (state) => {
    state.cells = [];
  },
  tr_close: (state) => {
    if (state.cells) state.lines.push(state.cells.join("\t"));
    state.cells = null;
  },
  table_close: (state) => state.lines.push(""),
  heading_close: (state) => state.lines.push(""),
  hr: (state) => state.lines.push(""),
  paragraph_close: (state, token) => {
    if (!token.hidden && state.lists.length === 0) state.lines.push("");
  },
  fence: (state, token) => state.lines.push(token.content.replace(/\n$/, ""), ""),
  code_block: (state, token) => state.lines.push(token.content.replace(/\n$/, ""), ""),
  inline: addInline,
};

export function contentBlockPlainText(markdown: string): string {
  const state: PlainTextState = { lines: [], lists: [], prefix: null, cells: null };
  for (const token of parser.parse(markdown, {})) {
    plainTextHandlers[token.type]?.(state, token);
  }
  return state.lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
