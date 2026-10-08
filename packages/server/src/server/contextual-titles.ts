import type { AgentManager, AgentManagerEvent } from "./agent/agent-manager.js";
import type { AgentStorage, StoredAgentRecord } from "./agent/agent-storage.js";
import { isSetupPrompt, resolveLegacyPromptTitle } from "./agent/create-agent-title.js";
import type { WorkspaceRegistry } from "./workspace-registry.js";
import type { GeneratedWorkspaceName } from "./worktree-branch-name-generator.js";

export const TITLE_MILESTONES: readonly number[] = [1, 4, 10];
const CONTEXT_MESSAGES = 6;
const MAX_MESSAGE_CHARS = 2000;

interface TitleCheckInput {
  agent: StoredAgentRecord;
  title: string;
  messages: string[];
}

interface ContextualTitleOptions {
  agentManager: Pick<
    AgentManager,
    "subscribe" | "getTimeline" | "notifyAgentState" | "onTitleReset"
  >;
  agentStorage: Pick<AgentStorage, "get" | "applyContextualTitle">;
  workspaceRegistry: Pick<WorkspaceRegistry, "update">;
  generate: (input: {
    agent: StoredAgentRecord;
    prompt: string;
    currentTitle: string | null;
  }) => Promise<GeneratedWorkspaceName | null>;
  titleStillFits?: (input: TitleCheckInput) => Promise<boolean>;
  emitWorkspaceUpdate: (workspaceId: string) => Promise<void>;
  onError: (error: unknown) => void;
}

export function countTitlePrompts(messages: readonly string[]): number {
  return messages.filter((message) => message.trim() && !isSetupPrompt(message)).length;
}

export function canGenerateContextualTitle(
  record: StoredAgentRecord,
  firstPrompt: string,
  promptCount: number,
): boolean {
  if (record.internal || record.titleSource === "manual") return false;
  if (record.titleSource === "provisional" || !record.title) return true;
  if (record.titleSource === "generated") {
    const reached = TITLE_MILESTONES.reduce(
      (last, milestone) => (milestone <= promptCount ? milestone : last),
      0,
    );
    return reached > (record.titleMilestone ?? 0);
  }
  return record.title === resolveLegacyPromptTitle(firstPrompt);
}

export class ContextualTitles {
  private readonly unsubscribe: () => void;
  private readonly unsubscribeReset: () => void;
  private readonly pending = new Map<string, Promise<void>>();
  private disposed = false;
  constructor(private readonly options: ContextualTitleOptions) {
    this.unsubscribe = options.agentManager.subscribe((event) => this.observe(event), {
      replayState: false,
    });
    this.unsubscribeReset = options.agentManager.onTitleReset((agentId) => this.enqueue(agentId));
  }

  private observe(event: AgentManagerEvent): void {
    if (
      this.disposed ||
      event.type !== "agent_stream" ||
      event.event.type !== "timeline" ||
      event.event.item.type !== "user_message"
    )
      return;
    const text = event.event.item.text;
    if (!text.trim() || isSetupPrompt(text)) return;
    this.enqueue(event.agentId);
  }

  private enqueue(agentId: string): void {
    if (this.disposed) return;
    const prior = this.pending.get(agentId) ?? Promise.resolve();
    const next = prior
      .then(() => this.generate(agentId))
      .catch((error) => this.options.onError(error));
    this.pending.set(agentId, next);
    void next.finally(() => {
      if (this.pending.get(agentId) === next) this.pending.delete(agentId);
    });
  }

  private userMessages(agentId: string): string[] {
    try {
      return this.options.agentManager
        .getTimeline(agentId)
        .flatMap((item) => (item.type === "user_message" ? [item.text] : []));
    } catch {
      return [];
    }
  }

  private async generate(agentId: string): Promise<void> {
    if (this.disposed) return;
    const record = await this.options.agentStorage.get(agentId);
    const messages = this.userMessages(agentId);
    const promptCount = countTitlePrompts(messages);
    const firstPrompt = messages[0] ?? "";
    if (!record || promptCount === 0) return;
    if (!canGenerateContextualTitle(record, firstPrompt, promptCount)) return;
    const recent = messages
      .slice(-CONTEXT_MESSAGES)
      .map((message) => message.slice(0, MAX_MESSAGE_CHARS));
    const expectedTitle = record.title ?? null;
    const currentTitle = record.titleSource === "generated" ? expectedTitle : null;
    if (
      currentTitle &&
      (await this.options.titleStillFits?.({
        agent: record,
        title: currentTitle,
        messages: recent,
      }))
    ) {
      await this.options.agentStorage.applyContextualTitle(
        agentId,
        currentTitle,
        expectedTitle,
        "generated",
        promptCount,
      );
      return;
    }
    const generated = await this.options.generate({
      agent: record,
      prompt: recent.join("\n\n"),
      currentTitle,
    });
    if (this.disposed || !generated?.title?.trim()) return;
    const title = generated.title.trim();
    const applied = await this.options.agentStorage.applyContextualTitle(
      agentId,
      title,
      expectedTitle,
      "generated",
      promptCount,
    );
    if (!applied || title === expectedTitle) return;
    this.options.agentManager.notifyAgentState(agentId);
    if (!record.workspaceId) return;
    const provisional = resolveLegacyPromptTitle(firstPrompt);
    let changed = false;
    await this.options.workspaceRegistry.update(record.workspaceId, (current) => {
      const follows =
        current.titleSource === "provisional" ||
        !current.title ||
        current.title === provisional ||
        current.title === expectedTitle;
      if (current.titleSource === "manual" || !follows) return current;
      changed = true;
      return { ...current, title, titleSource: "generated", updatedAt: new Date().toISOString() };
    });
    if (changed) await this.options.emitWorkspaceUpdate(record.workspaceId);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.unsubscribe();
    this.unsubscribeReset();
    await Promise.allSettled(this.pending.values());
  }
}
