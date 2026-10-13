import type { RelatedPullRequest } from "@/git/related-pull-requests";

export interface ScanRepository {
  owner: string;
  name: string;
}

export interface PullRequestCandidate {
  number: number;
  urls?: string[];
  mentions: number;
}

export interface WorkspaceChatScan {
  candidates: PullRequestCandidate[];
  found: RelatedPullRequest[];
  unresolved: number[];
}

const MAX_CANDIDATES = 50;
const RESOLVE_CONCURRENCY = 8;

const PULL_URL_PATTERN = /https?:\/\/[^\s/]+\/([^\s/]+)\/([^\s/]+)\/pull\/(\d{1,7})/g;
const BARE_REF_PATTERN = /(?:^|[^\w/#])#(\d{2,7})(?![\w/])/g;

export function collectPullRequestCandidates(input: {
  entries: readonly unknown[];
  repo: ScanRepository | null;
}): PullRequestCandidate[] {
  const mentions = new Map<number, number>();
  const urls = new Map<number, Set<string>>();
  const count = (number: number) => {
    if (mentions.size >= MAX_CANDIDATES && !mentions.has(number)) {
      return;
    }
    mentions.set(number, (mentions.get(number) ?? 0) + 1);
  };

  for (const entry of input.entries) {
    const text = messageText(entry);
    if (text === null) {
      continue;
    }
    const foreign = new Set<number>();
    PULL_URL_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PULL_URL_PATTERN.exec(text)) !== null) {
      const number = Number.parseInt(match[3] ?? "", 10);
      if (!Number.isSafeInteger(number) || number <= 0) {
        continue;
      }

      if (input.repo && !sameRepo(input.repo, match[1], match[2])) {
        foreign.add(number);
        continue;
      }
      count(number);
      if (mentions.has(number)) {
        const links = urls.get(number) ?? new Set<string>();
        links.add(match[0]);
        urls.set(number, links);
      }
    }
    BARE_REF_PATTERN.lastIndex = 0;
    while ((match = BARE_REF_PATTERN.exec(text)) !== null) {
      const number = Number.parseInt(match[1] ?? "", 10);
      if (Number.isSafeInteger(number) && number > 0 && !foreign.has(number)) {
        count(number);
      }
    }
  }

  return [...mentions.entries()]
    .map(([number, seen]) => {
      const links = urls.get(number);
      return { number, mentions: seen, urls: links ? [...links] : undefined };
    })
    .sort((left, right) => right.mentions - left.mentions || left.number - right.number);
}

export async function scanTranscriptForPullRequests(input: {
  entries: readonly unknown[];
  repo: ScanRepository | null;
  resolveNumber: (number: number) => Promise<RelatedPullRequest | null>;
}): Promise<WorkspaceChatScan> {
  const candidates = collectPullRequestCandidates({ entries: input.entries, repo: input.repo });
  const resolved = new Map<number, RelatedPullRequest>();
  const unresolved: number[] = [];

  for (let start = 0; start < candidates.length; start += RESOLVE_CONCURRENCY) {
    const batch = candidates.slice(start, start + RESOLVE_CONCURRENCY);
    const settled = await Promise.all(
      batch.map(async (candidate) => {
        const facts = await input.resolveNumber(candidate.number).catch(() => null);
        return {
          number: candidate.number,
          facts:
            facts &&
            (!candidate.urls ||
              candidate.urls.some((url) => url.toLowerCase() === facts.url.toLowerCase()))
              ? facts
              : null,
        };
      }),
    );
    for (const entry of settled) {
      if (entry.facts) {
        resolved.set(entry.number, entry.facts);
      } else {
        unresolved.push(entry.number);
      }
    }
  }

  return {
    candidates,
    found: candidates
      .map((candidate) => resolved.get(candidate.number))
      .filter((facts): facts is RelatedPullRequest => facts !== undefined),
    unresolved,
  };
}

function messageText(entry: unknown): string | null {
  const item = timelineItem(entry);
  if (item === null) {
    return null;
  }
  if (item.type !== "user_message" && item.type !== "assistant_message") {
    return null;
  }
  return typeof item.text === "string" ? item.text : null;
}

function timelineItem(entry: unknown): { type?: unknown; text?: unknown } | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }
  const envelope = entry as { item?: unknown; type?: unknown; text?: unknown };
  if (typeof envelope.item === "object" && envelope.item !== null) {
    return envelope.item as { type?: unknown; text?: unknown };
  }
  return envelope;
}

function sameRepo(repo: ScanRepository, owner?: string, name?: string): boolean {
  if (!owner || !name) {
    return false;
  }
  return (
    owner.toLowerCase() === repo.owner.toLowerCase() &&
    name.replace(/\.git$/, "").toLowerCase() === repo.name.toLowerCase()
  );
}
