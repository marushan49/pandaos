import type { Progress } from "./milestones";

export interface Decision {
  continueRun: boolean;
  reason: string;
}

export function decideContinue(input: {
  outcome: string;
  progress: Progress;
  previous: { open: number; done: number } | undefined;
  runsLastHour: number;
  runCap: number;
}): Decision {
  const { outcome, progress, previous, runsLastHour, runCap } = input;
  if (outcome !== "completed") return { continueRun: false, reason: `turn ${outcome}` };
  if (progress.blocked) return { continueRun: false, reason: `blocked: ${progress.blocked}` };
  if (progress.open === 0) return { continueRun: false, reason: "no open milestones" };
  if (runsLastHour >= runCap) {
    return { continueRun: false, reason: `run cap of ${runCap} per hour reached` };
  }
  if (previous && previous.open === progress.open && previous.done === progress.done) {
    return { continueRun: false, reason: "no progress since the last run" };
  }
  return { continueRun: true, reason: `${progress.open} open milestones` };
}
