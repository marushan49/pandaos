import { describe, expect, it } from "vitest";
import { createAssistantMarkdownParser } from "./assistant-markdown-parser";

describe("createAssistantMarkdownParser", () => {
  it.each([
    "[Film](out/movie.mp4)",
    "![Film](file:///tmp/movie.webm)",
    "[Film](https://example.com/movie.MP4?download=1)",
  ])("renders complete video references as a media token: %s", (source) => {
    const tokens = createAssistantMarkdownParser().parse(source, {});
    const video = tokens
      .flatMap((token) => token.children || [])
      .find((token) => token.type === "video");
    expect(video?.attrGet("src")).toContain("movie");
    expect(video?.attrGet("alt")).toBe("Film");
    expect(video?.block).toBe(true);
  });

  it("renders absolute links to documents as a file card", () => {
    const childTypes = (source: string) =>
      createAssistantMarkdownParser()
        .parse(source, {})
        .flatMap((token) => token.children || [])
        .map((token) => token.type);
    expect(childTypes("[Nachtrag](</home/admin/out/Nachtrag an Thomas.eml>)")).toContain(
      "file_card",
    );
    expect(childTypes("[Bericht](file:///tmp/bericht.pdf)")).toContain("file_card");
    expect(childTypes("[Code](/home/admin/x.ts:12)")).not.toContain("file_card");
    expect(childTypes("[Mail](~/Downloads/a.eml)")).not.toContain("file_card");
    expect(childTypes("[Mail](out/a.eml)")).not.toContain("file_card");
  });

  it("keeps image links, code and partial video destinations unchanged", () => {
    const parser = createAssistantMarkdownParser({ streaming: true });
    const sources = [
      "![Image](out/picture.png)",
      "`[Film](out/movie.mp4)`",
      "[Film](out/movie.mp4",
    ];
    for (const source of sources) {
      expect(
        parser
          .parse(source, {})
          .flatMap((token) => token.children || [])
          .some((token) => token.type === "video"),
      ).toBe(false);
    }
    expect(
      parser
        .parse("[Film](out/movie.mp4)", {})
        .flatMap((token) => token.children || [])
        .some((token) => token.type === "video"),
    ).toBe(true);
  });

  it("keeps bold text bold through every partial closing marker", () => {
    const parser = createAssistantMarkdownParser({ streaming: true });

    for (const source of ["**bold", "**bold*", "**bold**"]) {
      expect(parser.renderInline(source)).toBe("<strong>bold</strong>");
    }
  });

  it("shows the growing link label and only links a complete destination", () => {
    const parser = createAssistantMarkdownParser({ streaming: true });
    const source = "[docs](https://example.com/path)";
    for (let length = 1; length < source.length; length++) {
      expect(parser.renderInline(source.slice(0, length))).toBe(
        "docs".slice(0, Math.max(0, length - 1)),
      );
    }
    expect(parser.renderInline(source)).toBe('<a href="https://example.com/path">docs</a>');
  });

  it.each([
    ["**", "strong"],
    ["__", "strong"],
    ["*", "em"],
    ["_", "em"],
    ["~~", "s"],
    ["`", "code"],
    ["``", "code"],
  ])("keeps %s formatting stable as text and closing markers arrive", (marker, tag) => {
    const parser = createAssistantMarkdownParser({ streaming: true });
    for (let length = 1; length <= 4; length++) {
      expect(parser.renderInline(marker + "text".slice(0, length))).toBe(
        `<${tag}>${"text".slice(0, length)}</${tag}>`,
      );
    }
    for (let length = 0; length <= marker.length; length++) {
      expect(parser.renderInline(marker + "text" + marker.slice(0, length))).toBe(
        `<${tag}>text</${tag}>`,
      );
    }
  });

  it("keeps combined and nested emphasis stable through closing markers", () => {
    const parser = createAssistantMarkdownParser({ streaming: true });
    for (const closing of ["", "*", "**", "***"]) {
      expect(parser.renderInline("***both" + closing)).toBe("<em><strong>both</strong></em>");
    }
    expect(parser.renderInline("**bold and *italic")).toBe(
      "<strong>bold and <em>italic</em></strong>",
    );
    expect(parser.renderInline("*italic and **bold")).toBe(
      "<em>italic and <strong>bold</strong></em>",
    );
  });

  it.each(["*", "**", "***", "_", "__", "~~", "`", "``"])(
    "hides an opening %s while waiting for its text",
    (marker) => {
      expect(
        createAssistantMarkdownParser({ streaming: true }).renderInline("hello " + marker),
      ).toBe("hello ");
    },
  );

  it.each([
    "[docs](https://example.com/a(b)c)",
    '[docs](https://example.com "a title)")',
    "[docs](<https://example.com/a(b)>)",
    "[docs](file:///tmp/example.ts)",
  ])("waits for the entire destination of %s", (source) => {
    const parser = createAssistantMarkdownParser({ streaming: true });
    for (let length = 6; length < source.length; length++) {
      expect(parser.renderInline(source.slice(0, length))).toBe("docs");
    }
    expect(parser.renderInline(source)).toBe(createAssistantMarkdownParser().renderInline(source));
  });

  it("preserves formatting in incomplete labels and around incomplete links", () => {
    const parser = createAssistantMarkdownParser({ streaming: true });
    expect(parser.renderInline("[**bold")).toBe("<strong>bold</strong>");
    expect(parser.renderInline("[**bold**](https://exam")).toBe("<strong>bold</strong>");
    expect(parser.renderInline("**see [docs](https://exam")).toBe("<strong>see docs</strong>");
  });

  it("does not auto-link a URL label before the destination is complete", () => {
    const parser = createAssistantMarkdownParser({ streaming: true });
    expect(parser.renderInline("Read [example.com](https://exam")).toBe("Read example.com");
    expect(parser.renderInline("Read [example.com](https://example.org)")).toBe(
      'Read <a href="https://example.org">example.com</a>',
    );
  });

  it.each([
    "\\*literal",
    "\\[literal",
    "some_identifier",
    "some__identifier",
    "`**literal [link](url`",
    "``a ` b``",
    "**already closed** after",
    "[bad](javascript:alert(1))",
    "<component",
    "$$price",
    "20~25",
  ])("preserves literal and complete inline text: %s", (source) => {
    expect(createAssistantMarkdownParser({ streaming: true }).renderInline(source)).toBe(
      createAssistantMarkdownParser().renderInline(source),
    );
  });

  it.each([
    "```md\n**literal [link](url",
    "~~~md\n**literal [link](url",
    "    **literal [link](url",
    "**earlier\n\nplain tail",
    "- **earlier\n- plain tail",
  ])("leaves literal code and earlier blocks alone: %s", (source) => {
    expect(createAssistantMarkdownParser({ streaming: true }).render(source)).toBe(
      createAssistantMarkdownParser().render(source),
    );
  });

  it("completes inline formatting inside the final list item", () => {
    expect(createAssistantMarkdownParser({ streaming: true }).render("- first\n- **bold")).toBe(
      "<ul>\n<li>first</li>\n<li><strong>bold</strong></li>\n</ul>\n",
    );
  });

  it("hides incomplete images until their source is complete", () => {
    const parser = createAssistantMarkdownParser({ streaming: true });
    expect(parser.renderInline("before ![alt](https://exam")).toBe("before ");
    expect(parser.renderInline("before ![alt](https://example.com/image.png)")).toBe(
      'before <img src="https://example.com/image.png" alt="alt">',
    );
  });

  it("keeps ordinary parsing for completed messages", () => {
    const parser = createAssistantMarkdownParser();
    expect(parser.renderInline("**unfinished")).toBe("**unfinished");
    expect(parser.renderInline("[unfinished")).toBe("[unfinished");
  });

  it("renders agent text verbatim", () => {
    const parser = createAssistantMarkdownParser();

    expect(parser.renderInline("(c) (C) (r) (tm) (p)")).toBe("(c) (C) (r) (tm) (p)");
    expect(parser.renderInline("wait for it...")).toBe("wait for it...");
    expect(parser.renderInline("a -- b")).toBe("a -- b");
    expect(parser.renderInline(`run --name="my repo"`)).toBe("run --name=&quot;my repo&quot;");
    expect(parser.renderInline("it's fine")).toBe("it's fine");
  });

  it("allows file:// links, unlike every other parser", () => {
    const parser = createAssistantMarkdownParser();

    expect(parser.render("[open](file:///tmp/a.ts)")).toContain('href="file:///tmp/a.ts"');
  });

  it("still rejects javascript: links", () => {
    const parser = createAssistantMarkdownParser();

    expect(parser.render("[x](javascript:alert(1))")).not.toContain("href");
  });
});
