import MarkdownIt from "markdown-it";

const parser = new MarkdownIt({ html: false, linkify: true, breaks: true });
const cellStyle = "border:1px solid #c8c8c8;padding:6px 8px;text-align:left;vertical-align:top";

export function richWritingHtml(markdown: string): string {
  return parser
    .render(markdown)
    .replace(/<table>/g, '<table style="border-collapse:collapse">')
    .replace(/<th(?=[\s>])/g, `<th style="${cellStyle};background:#eef2f7"`)
    .replace(/<td(?=[\s>])/g, `<td style="${cellStyle}"`);
}
