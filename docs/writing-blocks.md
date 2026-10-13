# Writing blocks

A writing block is text the agent wrote for you to take somewhere else — an email, a chat message, a prompt, a description. Paseo renders it as a card with a copy button, so it reads apart from the agent's prose instead of dissolving into it.

## The convention

An agent marks it with a fence tagged `writing`, optionally followed by a title:

````markdown
I'd make the message friendlier:

```writing Reply to Mr Venn
Dear Mr Venn,

thank you, that worked.
```

That reads less demanding.
````

The title is the rest of the info line verbatim, so `Re: Angebot (final)` works. Everything before and after the fence stays normal prose.

Four backticks when the content has its own code fences. Three is fine otherwise.

## Why a fence

A fence is the one markdown construct every model gets right, and markdown-it already tokenises it — including the unterminated fence mid-stream, so the card is there from the first character instead of appearing when the turn ends.

It also degrades well. A surface that doesn't know `writing` — GitHub, the CLI, an older Paseo app — shows a code block: wrong font, right content, still copyable. Nothing is lost, which is why this needed no protocol change.

## Where it lives

- `packages/app/src/components/markdown/fence/index.tsx` dispatches the fence. `writing` is checked before the language table, because a title is not a language name.
- `packages/app/src/components/markdown/writing/` owns the card.
- `packages/server/src/server/agent/writing-block-instruction.ts` holds the instruction the daemon appends to every session, ahead of the operator's own `appendSystemPrompt`. Providers can't discover a host convention on their own, so all five are told.

The body of `writing` is rendered verbatim, not re-parsed as markdown. `**fett**` in a WhatsApp draft has to paste as asterisks, and what you see has to be what the copy button gives you.

## Rich variant

`writing-rich` is for text whose formatting has to survive the paste, such as an email with a table. The body is markdown: the card renders it, and the copy button puts HTML plus a plain-text fallback on the clipboard through `expo-clipboard`'s HTML format. `writing/html.ts` inlines table borders because Outlook and Gmail drop stylesheet rules on paste. Keep `writing` the default; a WhatsApp or Slack draft must not turn `**` into bold.

## Files next to the text

An agent that also saves the text as a file (an `.eml` draft, a `.docx`) links it with its absolute host path. A link to a document, archive or audio extension in `assistant-file-card/source.ts` becomes a card with Download, which reuses the file explorer's download token pipeline scoped to the file's directory. Video links keep their own player card. A `~` path or a path on another device has no card, because the daemon can only serve files on its own host.

## The line that keeps it useful

`writing` is only for content meant to be taken verbatim. Explanations, summaries, lists and quotes stay prose; code stays in a fence tagged with its language. Without that line every second answer turns into a card and the distinction stops carrying information.
