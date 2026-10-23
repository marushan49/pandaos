import { describe, expect, it } from "vitest";

import { extractUpdatePlanArguments, parseCodexRolloutPlans } from "./rollout-plans.js";

function line(value: unknown): string {
  return JSON.stringify(value);
}

describe("extractUpdatePlanArguments", () => {
  it("reads the plan object from a code-mode exec call", () => {
    const source =
      'text(await tools.update_plan({plan:[{step:"Zeilen von README.md zählen",status:"in_progress"},{step:\'Zeilen von "AGENTS.md" zählen\',status:"pending",},]})); | text(await tools.exec_command({cmd:"wc -l README.md"}));';
    expect(extractUpdatePlanArguments(source)).toEqual([
      {
        plan: [
          { step: "Zeilen von README.md zählen", status: "in_progress" },
          { step: 'Zeilen von "AGENTS.md" zählen', status: "pending" },
        ],
      },
    ]);
  });

  it("skips calls whose argument is not a plain literal", () => {
    const source = [
      "await tools.update_plan({plan: steps});",
      "await tools.update_plan({plan:[{step:`Step ${n}`,status:'pending'}]});",
      'await tools.update_plan({plan:[{step:"Read (README.md)",status:"completed"}]});',
    ].join("\n");
    expect(extractUpdatePlanArguments(source)).toEqual([
      { plan: [{ step: "Read (README.md)", status: "completed" }] },
    ]);
  });
});

describe("parseCodexRolloutPlans", () => {
  it("assigns code-mode and function-call plan updates to their turns", () => {
    const content = [
      line({ type: "turn_context", payload: { turn_id: "turn-1" } }),
      line({
        timestamp: "2026-10-23T19:40:30.000Z",
        type: "response_item",
        payload: {
          type: "custom_tool_call",
          name: "exec",
          input: 'text(await tools.update_plan({plan:[{step:"A",status:"in_progress"}]}));',
        },
      }),
      line({ type: "event_msg", payload: { type: "task_started", turn_id: "turn-2" } }),
      line({
        timestamp: "2026-10-23T19:41:00.000Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "update_plan",
          arguments: JSON.stringify({ plan: [{ step: "A", status: "completed" }] }),
        },
      }),
      line({
        type: "response_item",
        payload: { type: "function_call", name: "update_plan", arguments: "{not json" },
      }),
      "",
    ].join("\n");

    expect(parseCodexRolloutPlans(content)).toEqual([
      {
        turnId: "turn-1",
        timestamp: "2026-10-23T19:40:30.000Z",
        steps: [{ step: "A", status: "in_progress" }],
      },
      {
        turnId: "turn-2",
        timestamp: "2026-10-23T19:41:00.000Z",
        steps: [{ step: "A", status: "completed" }],
      },
    ]);
  });
});
