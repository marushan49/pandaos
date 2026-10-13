# Content blocks

A content block is something the agent wrote for you to take elsewhere: an email, a document, a chat message, a prompt. Paseo renders it as a card with copy and edit controls, so it reads apart from the agent's prose.

## The convention

The agent tags a fence with the content type and an optional title:

````markdown
I'd make the reply friendlier:

```email Re: Angebot (final)
Hallo Herr Venn,

danke, **das hat funktioniert**.
```
````

| Tag            | Card                       | Default copy                |
| -------------- | -------------------------- | --------------------------- |
| `email`        | rendered Markdown, subject | formatted (HTML plus plain) |
| `document`     | rendered Markdown          | formatted                   |
| `writing-rich` | rendered Markdown          | formatted                   |
| `writing`      | verbatim text              | the text as written         |
| `prompt`       | verbatim text              | the text as written         |

The title is the rest of the info line verbatim, so `Re: Angebot (final)` works. Four backticks when the content has its own code fences.

The type comes from the tag, not from guessing at the text. Untagged prose stays a normal chat answer. `packages/server/src/server/agent/writing-block-instruction.ts` tells every provider the tags, because a provider can't discover a host convention on its own.

## Why a fence

A fence is the one Markdown construct every model gets right, and markdown-it tokenises it, including the unterminated fence mid-stream, so the card is there from the first character. A surface that doesn't know the tag (GitHub, the CLI, an older Paseo app) shows a code block: wrong font, right content, still copyable. That is why this needed no protocol change.

## Copying

Rich cards copy formatted by default, with a menu for "Copy as text" and "Copy as Markdown". Verbatim cards copy their text and have no menu: `**fett**` in a WhatsApp draft has to paste as asterisks.

- Formatted writes `text/html` plus a plain-text version. `format.ts` builds both from the Markdown with markdown-it (`html: false`, so raw HTML in agent output is escaped) and inlines table borders, because Outlook and Gmail drop stylesheet rules on paste.
- On web, `clipboard.web.ts` writes a `ClipboardItem` with both types, so the plain half is the clean text from `format.ts`. Without `ClipboardItem` it falls back to plain text.
- On iOS and Android, `expo-clipboard` writes the HTML and the platform derives the plain half from it. "Copy as text" still writes the clean text.

Code blocks are not content blocks. Their copy button copies the code without the fence (`highlighted-code-block.tsx`).

## Editing

The pencil switches a finished card to a Markdown source editor; rich cards add bold, italic and heading buttons that wrap the selection. Copy always uses the edited text. The edit lives in an in-memory store keyed by message and block (`edit-store.ts`), shows an "Edited" label with a reset button, and is never sent to the agent. Streaming cards can't be edited.

The editor is a plain text field, not a WYSIWYG surface. A rich-text editor would need a new dependency with different implementations on web and native, and the Markdown source keeps rendering and editing separate.

## Where it lives

- `packages/app/src/components/markdown/fence/index.tsx` dispatches the fence. Content tags are checked before the language table, because a title is not a language name.
- `packages/app/src/components/markdown/content-block/` owns the card, the formatters, the clipboard split and the editor helpers.

## Files next to the text

An agent that also saves the text as a file (an `.eml` draft, a `.docx`) links it with its absolute host path. A link to a document, archive or audio extension in `assistant-file-card/source.ts` becomes a card with Download, which reuses the file explorer's download token pipeline scoped to the file's directory. Video links keep their own player card. A `~` path or a path on another device has no card, because the daemon can only serve files on its own host.
