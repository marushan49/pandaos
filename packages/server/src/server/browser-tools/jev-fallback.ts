const SAFE_OPERATIONS = new Set(["SCROLL_DOWN", "SCROLL_UP", "WAIT"]);
const SAFE_MIN_CONFIDENCE = 0.2;
export const MAX_UNSURE_RETRIES = 2;
const MAX_STOP_DONE_ITEMS = 6;
const MAX_STOP_GOAL_CHARS = 200;

export type ConfidenceGate = "execute" | "execute_unsure" | "retry" | "stop";

export interface ConfidenceGateInput {
  operation: string;
  confidence: number;
  minConfidence: number;
  unsureSoFar: number;
}

export function gateConfidence(input: ConfidenceGateInput): ConfidenceGate {
  if (input.confidence >= input.minConfidence) return "execute";
  if (input.unsureSoFar >= MAX_UNSURE_RETRIES) return "stop";
  if (
    SAFE_OPERATIONS.has(input.operation) &&
    input.confidence >= Math.min(SAFE_MIN_CONFIDENCE, input.minConfidence)
  ) {
    return "execute_unsure";
  }
  return "retry";
}

export interface UnsureStop {
  reason: string;
  operation: string;
  confidence: number;
  minConfidence: number;
  looks: number;
  goal: string;
  done: string[];
  title: string;
  url: string;
  browserId: string;
  controls: string[];
  guess?: string;
}

const TOOL_FOR_OPERATION: Record<string, string> = {
  CLICK: "browser_click",
  FILL: "browser_fill",
  PRESS_ENTER: "browser_keypress",
};

export function formatUnsureStop(stop: UnsureStop): string {
  const goal =
    stop.goal.length > MAX_STOP_GOAL_CHARS
      ? `${stop.goal.slice(0, MAX_STOP_GOAL_CHARS)}...`
      : stop.goal;
  const done = stop.done.slice(-MAX_STOP_DONE_ITEMS);
  const lines = [
    `${stop.reason} (confidence ${stop.confidence.toFixed(2)}, needs ${stop.minConfidence.toFixed(2)}; ${stop.looks} fresh looks did not settle it).`,
    `Goal: ${goal}`,
    `Done so far: ${done.length > 0 ? done.join(", ") : "nothing executed"}`,
    `Stuck on: ${stop.title || "Untitled"} ${stop.url}`,
  ];
  if (stop.controls.length > 0) lines.push(`Visible controls: ${stop.controls.join(", ")}`);
  lines.push(`Next: ${nextStepFor(stop)}`);
  return lines.join("\n");
}

function nextStepFor(stop: UnsureStop): string {
  const tool = TOOL_FOR_OPERATION[stop.operation] ?? "browser_click";
  const rest = "then browser_goal again for the rest";
  if (stop.guess) {
    return `Jev's best guess was ${stop.guess} for ${stop.operation}. If it matches the goal, call ${tool} on browserId ${stop.browserId} with that ref, ${rest}.`;
  }
  if (stop.operation === "BLOCKED") {
    return `Jev saw no way forward. If the goal needs data Jev was not given, pass it in values; otherwise act on a ref above with browser_click or browser_fill on browserId ${stop.browserId}, ${rest}.`;
  }
  return `Pick the control above that matches the goal and call ${tool} on browserId ${stop.browserId}, ${rest}.`;
}

const STEP_WINDOW_MS = 3 * 60_000;
const HINT_FIRST_STEP = 7;
const HINT_EVERY = 3;
const RESET_TOOLS = new Set(["browser_goal", "browser_test"]);
const UNCOUNTED_TOOLS = new Set(["browser_handoff"]);

export interface BrowserStepWindow {
  steps: number[];
  hint?: string;
}

export function nextBrowserStepWindow(params: {
  previous: readonly number[];
  tool: string;
  now: number;
}): BrowserStepWindow {
  if (RESET_TOOLS.has(params.tool)) return { steps: [] };
  if (!params.tool.startsWith("browser_") || UNCOUNTED_TOOLS.has(params.tool)) {
    return { steps: [...params.previous] };
  }
  const steps = [...params.previous.filter((at) => params.now - at < STEP_WINDOW_MS), params.now];
  const count = steps.length;
  if (count < HINT_FIRST_STEP || (count - HINT_FIRST_STEP) % HINT_EVERY !== 0) return { steps };
  return {
    steps,
    hint: `Du hast ${count} einzelne Browser-Schritte hintereinander gemacht. browser_goal erledigt mehrere Schritte in einem Aufruf (Ziel plus Prüfungen), das spart Zeit und Kontext.`,
  };
}

const stepsByWorkspace = new Map<string, number[]>();

export function recordBrowserStep(workspaceId: string, tool: string): string | undefined {
  const next = nextBrowserStepWindow({
    previous: stepsByWorkspace.get(workspaceId) ?? [],
    tool,
    now: Date.now(),
  });
  if (next.steps.length === 0) stepsByWorkspace.delete(workspaceId);
  else stepsByWorkspace.set(workspaceId, next.steps);
  return next.hint;
}
