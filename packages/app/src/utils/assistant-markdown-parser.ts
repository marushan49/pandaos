import type MarkdownIt from "markdown-it";
import { createMarkdownParser } from "@/utils/markdown-parser";
import { enableStreamingMarkdown } from "@/utils/streaming-markdown";
import { videoMimeType } from "@/assistant-video/source";
import { assistantFileCardPath } from "@/assistant-file-card/source";

export function createAssistantMarkdownParser({ streaming = false } = {}): MarkdownIt {
  const parser = createMarkdownParser({ linkify: true });
  const defaultValidateLink = parser.validateLink.bind(parser);

  parser.validateLink = (url: string) =>
    url.trim().toLowerCase().startsWith("file://") || defaultValidateLink(url);

  if (streaming) {
    enableStreamingMarkdown(parser);
  }

  parser.core.ruler.push("assistant_video", (state) => {
    for (const block of state.tokens) {
      const children = block.children;
      if (!children) continue;
      for (let index = 0; index < children.length; index++) {
        const token = children[index]!;
        if (token.type === "image" && videoMimeType(token.attrGet("src") || "")) {
          token.type = "video";
          token.tag = "video";
          token.block = true;
          token.attrSet("alt", token.content);
          continue;
        }
        const source = token.type === "link_open" ? token.attrGet("href") : null;
        if (!source) continue;
        let type: "video" | "file_card" | null = null;
        if (videoMimeType(source)) type = "video";
        else if (assistantFileCardPath(source)) type = "file_card";
        if (!type) continue;
        const end = children.findIndex(
          (child, childIndex) => childIndex > index && child.type === "link_close",
        );
        if (end < 0) continue;
        const card = new state.Token(type, type, 0);
        card.block = true;
        card.attrSet("src", source);
        card.attrSet(
          "alt",
          children
            .slice(index + 1, end)
            .map((child) => child.content)
            .join(""),
        );
        children.splice(index, end - index + 1, card);
      }
      const inlineStack: typeof children = [];
      const normalized: typeof children = [];
      for (const token of children) {
        if (token.type === "video" || token.type === "file_card") {
          for (let index = inlineStack.length - 1; index >= 0; index--) {
            const open = inlineStack[index]!;
            normalized.push(new state.Token(open.type.replace(/_open$/, "_close"), open.tag, -1));
          }
          normalized.push(token);
          for (const open of inlineStack) {
            normalized.push(Object.assign(new state.Token(open.type, open.tag, 1), open));
          }
          continue;
        }
        if (token.nesting === 1) inlineStack.push(token);
        if (token.nesting === -1) inlineStack.pop();
        normalized.push(token);
      }
      block.children = normalized;
    }
  });

  return parser;
}
