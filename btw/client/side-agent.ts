import type { usePaseo } from "@getpaseo/plugin/client";

type PaseoApi = ReturnType<typeof usePaseo>;

export const BTW_LABEL = "btw.parent";
const SIDE_PROVIDER = "claude/claude-haiku-5-5";
const CONTEXT_ENTRIES = 40;
const ENTRY_CHARS = 1500;
const CONTEXT_CHARS = 20000;

const SYSTEM_PROMPT =
  'You answer short side questions ("by the way") about a coding session that keeps running ' +
  "elsewhere. You get the latest transcript of that session with every question. Answer from it " +
  "and from read-only inspection. Never edit files, never run commands that change anything, " +
  "and keep answers short.";

export async function findSideAgentId(paseo: PaseoApi, parentId: string): Promise<string | null> {
  const result = await paseo.agents.list({
    filter: { labels: { [BTW_LABEL]: parentId } },
    page: { limit: 1 },
  });
  return result.entries[0]?.agent.id ?? null;
}

async function transcriptOf(paseo: PaseoApi, parentId: string): Promise<string> {
  const page = await paseo.agents
    .ref(parentId)
    .timeline.refetch({ direction: "tail", limit: CONTEXT_ENTRIES, projection: "projected" });
  const lines: string[] = [];
  for (const entry of page.entries) {
    const item = entry.item;
    if (item.type === "user_message") lines.push(`User: ${item.text.slice(0, ENTRY_CHARS)}`);
    if (item.type === "assistant_message") {
      lines.push(`Assistant: ${item.text.slice(0, ENTRY_CHARS)}`);
    }
  }
  return lines.join("\n\n").slice(-CONTEXT_CHARS);
}

export async function askSideQuestion(
  paseo: PaseoApi,
  parent: { id: string; cwd: string | null; title?: string | null },
  question: string,
): Promise<void> {
  const transcript = await transcriptOf(paseo, parent.id);
  const prompt = `Latest transcript of the main session:\n\n${transcript}\n\nSide question: ${question}`;
  const existing = await findSideAgentId(paseo, parent.id);
  if (existing) {
    await paseo.agents.ref(existing).send(prompt);
    return;
  }
  if (!parent.cwd) throw new Error("This session has no working directory yet");
  await paseo.agents.create({
    cwd: parent.cwd,
    title: `BTW · ${parent.title ?? "session"}`,
    labels: { [BTW_LABEL]: parent.id },
    config: { provider: SIDE_PROVIDER, modeId: "plan", systemPrompt: SYSTEM_PROMPT },
    prompt,
  });
}

export async function resetSideAgent(paseo: PaseoApi, parentId: string): Promise<void> {
  const existing = await findSideAgentId(paseo, parentId);
  if (existing) await paseo.agents.ref(existing).archive();
}
