import { z } from "zod";
import { MailSchema, type Mail } from "../shared/contracts";

interface Part {
  mime_type?: string | null;
  filename?: string | null;
  body?: { content?: string | null; base64_url_content?: string | null } | null;
  parts?: Part[] | null;
}
const PartSchema: z.ZodType<Part> = z.lazy(() =>
  z.object({
    mime_type: z.string().nullish(),
    filename: z.string().nullish(),
    body: z
      .object({ content: z.string().nullish(), base64_url_content: z.string().nullish() })
      .nullish(),
    parts: z.array(PartSchema).nullish(),
  }),
);
export const GmailMessageSchema = z.object({
  id: z.string().regex(/^[a-fA-F0-9]+$/),
  thread_id: z.string().regex(/^[a-fA-F0-9]+$/),
  internal_date: z.string().regex(/^\d+$/),
  payload: PartSchema.and(
    z.object({ headers: z.array(z.object({ name: z.string(), value: z.string() })) }),
  ),
});

function texts(part: Part, mime: string): string[] {
  if (part.filename) return [];
  if (part.mime_type === mime) {
    const content =
      part.body?.content ??
      (part.body?.base64_url_content
        ? Buffer.from(part.body.base64_url_content, "base64url").toString("utf8")
        : "");
    return content.trim() ? [content] : [];
  }
  return (part.parts ?? []).flatMap((child) => texts(child, mime));
}
function plainHtml(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}
export function gmailMail(input: unknown, account: string): Mail | undefined {
  const message = GmailMessageSchema.parse(input);
  const header = (name: string) =>
    message.payload.headers.find((h) => h.name.toLowerCase() === name)?.value ?? "";
  const plain = texts(message.payload, "text/plain").join("\n");
  const body = (plain || plainHtml(texts(message.payload, "text/html").join("\n")))
    .trim()
    .slice(0, 40000);
  if (!body) return undefined;
  const from = header("from");
  const address = from.match(/<([^<>]+)>/)?.[1] ?? from;
  const sender =
    from
      .replace(/<[^<>]+>/, "")
      .trim()
      .replace(/^"|"$/g, "")
      .trim() || address;
  const precedence = header("precedence").toLowerCase();
  const submitted = header("auto-submitted").toLowerCase();
  const bulk =
    ["bulk", "list", "junk"].includes(precedence) || Boolean(submitted && submitted !== "no");
  return MailSchema.parse({
    source: "gmail",
    id: `gmail:${account}:${message.id}`,
    conversationId: `gmail:${account}:${message.thread_id}`,
    subject: (header("subject").trim() || "Mail ohne Betreff").slice(0, 1000),
    sender: sender.slice(0, 200),
    senderEmail: address.trim().slice(0, 320),
    body,
    receivedAt: new Date(Number(message.internal_date)).toISOString(),
    webLink: `https://mail.google.com/mail/?authuser=${encodeURIComponent(account)}#all/${message.thread_id}`,
    bulk,
  });
}
