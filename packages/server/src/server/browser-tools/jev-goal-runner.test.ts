import { describe, expect, it } from "vitest";
import type { BrowserToolsExecuteInput } from "./broker.js";
import type { BrowserToolsResponsePayload } from "./errors.js";
import { JevBrowserGoalRunner, parseObservedElements } from "./jev-goal-runner.js";
import type {
  BrowserActivityEvent,
  BrowserHandoff,
} from "@getpaseo/protocol/browser-activity/rpc-schemas";
import { BrowserActivityHub } from "./browser-activity.js";
import type {
  TypeSafeChoiceAnswer,
  TypeSafeDecisionRequest,
  TypeSafeDecisionSource,
} from "./jev-client.js";

const BROWSER_ID = "11111111-1111-4111-8111-111111111111";
const CONTEXT = { agentId: "agent-1", cwd: "/repo", workspaceId: "workspace-1" };

class GoalBroker {
  public readonly calls: BrowserToolsExecuteInput[] = [];
  public filledValue: string | undefined;
  public clicked = false;
  public staleClicks = false;

  public async execute(input: BrowserToolsExecuteInput): Promise<BrowserToolsResponsePayload> {
    this.calls.push(input);
    const command = input.command;
    switch (command.command) {
      case "snapshot":
        return snapshotPayload(
          this.clicked
            ? '- heading "Welcome" @e1'
            : '- textbox "Email" @e1\n- button "Continue" [ref=@e2]',
        );
      case "fill":
        this.filledValue = command.args.value;
        return success({ command: "fill", browserId: BROWSER_ID, ref: command.args.ref });
      case "click":
        if (this.staleClicks) {
          return {
            requestId: "request-stale",
            ok: false,
            error: {
              code: "browser_stale_ref",
              message: "Ref expired",
              retryable: true,
            },
          };
        }
        this.clicked = true;
        return success({ command: "click", browserId: BROWSER_ID, ref: command.args.ref });
      case "wait":
        return success({
          command: "wait",
          browserId: BROWSER_ID,
          matched: command.args.text ? "text" : "url",
        });
      default:
        throw new Error(`Unexpected browser command ${command.command}`);
    }
  }
}

class ScriptedDecisions implements TypeSafeDecisionSource {
  public readonly requests: TypeSafeDecisionRequest[] = [];

  public constructor(
    private readonly operations: string[],
    private readonly goalKind: "check" | "act" = "check",
  ) {}

  public async decide(request: TypeSafeDecisionRequest) {
    this.requests.push(request);
    if (request.questions.goal_kind) {
      return {
        answers: { goal_kind: answerFor(request, "goal_kind", this.goalKind) },
        model: "jev-test",
        latencyMs: 3,
        usage: { inputTokens: 40, outputTokens: 2 },
      };
    }
    const operation = this.operations.shift();
    if (!operation) throw new Error("No scripted decision remaining");
    const answers: Record<string, TypeSafeChoiceAnswer> = {
      operation: answerFor(request, "operation", operation),
    };
    if (operation === "FILL") {
      answers.fill_target = answerFor(request, "fill_target", "1");
      answers.fill_value = answerFor(request, "fill_value", "1");
    }
    if (operation === "CLICK") {
      answers.click_target = answerFor(request, "click_target", "2");
    }
    return {
      answers,
      model: "jev-test",
      latencyMs: 7,
      usage: { inputTokens: 100, outputTokens: 10 },
    };
  }
}

describe("JevBrowserGoalRunner", () => {
  it("clarifies an unsure value against the accepted field before filling", async () => {
    const broker = new GoalBroker();
    let calls = 0;
    const decisions = new ScriptedDecisions(["FILL", "CLICK"]);
    const result = await new JevBrowserGoalRunner({
      broker,
      decisionSource: {
        decide: async (request) => {
          calls += 1;
          if (!request.questions.operation) {
            expect(request.state).toEqual({
              selected_field: { index: 1, role: "textbox", name: "Email" },
              recent_actions: [],
            });
            expect(JSON.stringify(request)).not.toContain("private-account");
            return {
              answers: { fill_value: answerFor(request, "fill_value", "1") },
              model: "test",
              latencyMs: 1,
            };
          }
          const response = await decisions.decide(request);
          if (calls === 1) response.answers.fill_value = answerFor(request, "fill_value", "1", 0.1);
          return response;
        },
      },
    }).run(
      {
        goal: "Fill the account email then Continue to Welcome",
        browserId: BROWSER_ID,
        values: {
          account: { value: "private-account", description: "account email" },
          other: { value: "unused-private" },
        },
        verify: [{ text: "Welcome" }],
      },
      CONTEXT,
    );
    expect(result.status).toBe("passed");
    expect(calls).toBe(3);
    expect(broker.filledValue).toBe("private-account");
    expect(broker.calls.filter((call) => call.command.command === "fill")).toHaveLength(1);
  });

  it("passes a check goal whose verification already holds without choosing an action", async () => {
    const broker = new GoalBroker();
    broker.clicked = true;
    const decisions = new ScriptedDecisions([]);
    const result = await new JevBrowserGoalRunner({ broker, decisionSource: decisions }).run(
      { goal: "Verify Welcome", browserId: BROWSER_ID, verify: [{ text: "Welcome" }] },
      CONTEXT,
    );
    expect(result.status).toBe("passed");
    expect(result.usage).toEqual({ decisions: 1, inputTokens: 40, outputTokens: 2 });
    expect(decisions.requests.map((request) => Object.keys(request.questions))).toEqual([
      ["goal_kind"],
    ]);
    expect(broker.calls.some((call) => call.command.command === "click")).toBe(false);
  });

  it("does not pass an action goal on verification that held before any action", async () => {
    const broker = new GoalBroker();
    broker.clicked = true;
    const decisions = new ScriptedDecisions([], "act");
    const result = await new JevBrowserGoalRunner({ broker, decisionSource: decisions }).run(
      { goal: "Open the Tasks tab", browserId: BROWSER_ID, verify: [{ text: "Welcome" }] },
      CONTEXT,
    );
    expect(result.status).toBe("uncertain");
    expect(result.message).toContain("No action ran");
    expect(broker.calls.some((call) => call.command.command === "click")).toBe(false);
  });

  it("does not pass when Jev declares an action goal done before acting", async () => {
    const broker = new GoalBroker();
    const decisions = new ScriptedDecisions(["DONE"], "act");
    const result = await new JevBrowserGoalRunner({ broker, decisionSource: decisions }).run(
      { goal: "Open the Tasks tab", browserId: BROWSER_ID, verify: [{ text: "Welcome" }] },
      CONTEXT,
    );
    expect(result.status).toBe("uncertain");
    expect(decisions.requests.map((request) => Object.keys(request.questions)[0])).toEqual([
      "operation",
      "goal_kind",
    ]);
  });

  it("retains the tab and trace for active-agent takeover on provider failure", async () => {
    const broker = new GoalBroker();
    const result = await new JevBrowserGoalRunner({
      broker,
      decisionSource: {
        decide: async () => {
          throw new Error("Provider unavailable");
        },
      },
    }).run({ goal: "Continue", browserId: BROWSER_ID, verify: [{ text: "Welcome" }] }, CONTEXT);
    expect(result).toMatchObject({ status: "uncertain", browserId: BROWSER_ID, steps: [] });
    expect(result.message).toContain("Provider unavailable");
    expect(broker.calls.some((call) => call.command.command === "click")).toBe(false);
  });

  it("re-observes malformed decisions before acting and never clicks twice", async () => {
    const broker = new GoalBroker();
    const scripted = new ScriptedDecisions(["CLICK"]);
    let calls = 0;
    const result = await new JevBrowserGoalRunner({
      broker,
      decisionSource: {
        decide: async (request) =>
          ++calls === 1
            ? { answers: { operation: { invalid: true } }, model: "fixture", latencyMs: 1 }
            : scripted.decide(request),
      },
    }).run({ goal: "Continue", browserId: BROWSER_ID, verify: [{ text: "Welcome" }] }, CONTEXT);
    expect(result.status).toBe("passed");
    expect(calls).toBe(2);
    expect(broker.calls.filter((call) => call.command.command === "click")).toHaveLength(1);
  });

  it("does not retry a timed-out submission whose execution is uncertain", async () => {
    const broker = new GoalBroker();
    const execute = broker.execute.bind(broker);
    let clicks = 0;
    broker.execute = async (input) => {
      if (input.command.command !== "click") return execute(input);
      clicks += 1;
      return {
        requestId: "timeout",
        ok: false,
        error: {
          code: "browser_timeout",
          message: "Submission response timed out",
          retryable: true,
        },
      };
    };
    const result = await new JevBrowserGoalRunner({
      broker,
      decisionSource: new ScriptedDecisions(["CLICK"]),
    }).run({ goal: "Continue", browserId: BROWSER_ID, verify: [{ text: "Welcome" }] }, CONTEXT);
    expect(result.status).toBe("blocked");
    expect(result.steps[0]?.outcome).toBe("execution_uncertain");
    expect(clicks).toBe(1);
  });

  it("verifies a successful submission after its response timed out", async () => {
    const broker = new GoalBroker();
    const execute = broker.execute.bind(broker);
    let clicks = 0;
    broker.execute = async (input) => {
      if (input.command.command !== "click") return execute(input);
      clicks += 1;
      broker.clicked = true;
      return {
        requestId: "timeout",
        ok: false,
        error: { code: "browser_timeout", message: "Response timed out", retryable: true },
      };
    };
    const result = await new JevBrowserGoalRunner({
      broker,
      decisionSource: new ScriptedDecisions(["CLICK"]),
    }).run({ goal: "Continue", browserId: BROWSER_ID, verify: [{ text: "Welcome" }] }, CONTEXT);
    expect(result.status).toBe("passed");
    expect(result.steps[0]?.outcome).toBe("execution_uncertain");
    expect(clicks).toBe(1);
  });

  it("verifies the final permitted action before reporting a step limit", async () => {
    const broker = new GoalBroker();
    const execute = broker.execute.bind(broker);
    broker.execute = (input) =>
      input.command.command === "snapshot" && !broker.clicked
        ? Promise.resolve(snapshotPayload('- heading "Page" @e1\n- button "Continue" @e2'))
        : execute(input);
    const decisions = new ScriptedDecisions(["CLICK"]);
    const result = await new JevBrowserGoalRunner({ broker, decisionSource: decisions }).run(
      { goal: "Continue", browserId: BROWSER_ID, verify: [{ text: "Welcome" }], maxSteps: 1 },
      CONTEXT,
    );
    expect(result.status).toBe("passed");
    expect(Object.keys(decisions.requests[0]?.questions.click_target?.criteria ?? {})).toEqual([
      "2",
    ]);
    expect(result.steps[0]?.control).toEqual({ role: "button", name: "Continue" });
    expect(broker.calls.filter((call) => call.command.command === "click")).toHaveLength(1);
  });

  it("uses the existing snapshot reader if the compact reader fails", async () => {
    const broker = new GoalBroker();
    const execute = broker.execute.bind(broker);
    broker.execute = (input) =>
      input.command.command === "snapshot" && input.command.args.forGoal
        ? Promise.resolve({
            requestId: "compact",
            ok: false,
            error: {
              code: "browser_unknown_error",
              message: "Compact DOM unavailable",
              retryable: false,
            },
          })
        : execute(input);
    const result = await new JevBrowserGoalRunner({
      broker,
      decisionSource: new ScriptedDecisions(["CLICK"]),
    }).run({ goal: "Continue", browserId: BROWSER_ID, verify: [{ text: "Welcome" }] }, CONTEXT);
    expect(result.status).toBe("passed");
    expect(
      broker.calls
        .filter((call) => call.command.command === "snapshot")
        .every((call) => call.command.command === "snapshot" && !call.command.args.forGoal),
    ).toBe(true);
  });

  it("fills locally, clicks, and only passes after deterministic verification", async () => {
    const broker = new GoalBroker();
    const decisions = new ScriptedDecisions(["FILL", "CLICK", "DONE"]);
    const runner = new JevBrowserGoalRunner({ broker, decisionSource: decisions });
    const secretValue = "not-sent-to-typesafe";

    const result = await runner.run(
      {
        goal: "Sign in with the account value and reach Welcome",
        browserId: BROWSER_ID,
        values: { account: { value: secretValue, description: "test account email" } },
        verify: [{ text: "Welcome" }],
      },
      CONTEXT,
    );

    expect(result.status).toBe("passed");
    expect(result.steps.map((step) => step.operation)).toEqual(["FILL", "CLICK"]);
    expect(result.usage).toEqual({ decisions: 2, inputTokens: 200, outputTokens: 20 });
    expect(broker.filledValue).toBe(secretValue);
    expect(JSON.stringify(decisions.requests)).not.toContain(secretValue);
    expect(JSON.stringify(result)).not.toContain(secretValue);
    expect(broker.calls.findLast((call) => call.command.command !== "screenshot")?.command).toEqual(
      {
        command: "wait",
        args: { browserId: BROWSER_ID, text: "Welcome", timeoutMs: 1_000 },
      },
    );
  });

  it("uses global element indices for native options and skips already filled public text", async () => {
    const calls: BrowserToolsExecuteInput[] = [];
    let selected = false;
    let clicked = false;
    const broker = {
      execute: async (input: BrowserToolsExecuteInput): Promise<BrowserToolsResponsePayload> => {
        calls.push(input);
        switch (input.command.command) {
          case "snapshot":
            return snapshotPayload(
              clicked
                ? '- heading "Welcome" @e1'
                : [
                    '- textbox "Route" @e1',
                    '  state @e1 {"editable":true,"clickable":true,"value":"Vienna"}',
                    '- combobox "Travel class" @e2',
                    `  state @e2 ${JSON.stringify({ editable: false, clickable: false, value: selected ? "First" : "Economy", options: selected ? [] : [{ label: "First", value: "first" }] })}`,
                    '- button "Search" @e3',
                    '  state @e3 {"editable":false,"clickable":true}',
                  ].join("\n"),
            );
          case "select":
            expect(input.command.args).toMatchObject({ ref: "@e2", value: "first" });
            selected = true;
            return success({
              command: "select",
              browserId: BROWSER_ID,
              ref: "@e2",
              value: "first",
            });
          case "click":
            clicked = true;
            return success({ command: "click", browserId: BROWSER_ID, ref: "@e3" });
          case "wait":
            return success({ command: "wait", browserId: BROWSER_ID, matched: "text" });
          default:
            throw new Error(`Unexpected ${input.command.command}`);
        }
      },
    };
    const decisionSource: TypeSafeDecisionSource = {
      decide: async (request) => {
        expect(request.questions.operation.criteria).not.toHaveProperty("FILL");
        return {
          answers: selected
            ? {
                operation: answerFor(request, "operation", "CLICK"),
                click_target: answerFor(request, "click_target", "3"),
                select_target: { invalid: "unused head cannot execute" },
              }
            : {
                operation: answerFor(request, "operation", "SELECT"),
                select_target: answerFor(request, "select_target", "2:1"),
                click_target: { invalid: "unused head cannot execute" },
              },
          model: "jev-test",
          latencyMs: 1,
        };
      },
    };
    const result = await new JevBrowserGoalRunner({ broker, decisionSource }).run(
      {
        browserId: BROWSER_ID,
        goal: "Find first class trains from Vienna",
        values: { route: { text: "Vienna" } },
        verify: [{ text: "Welcome" }],
      },
      CONTEXT,
    );
    expect(result.status).toBe("passed");
    expect(result.steps.map((step) => step.operation)).toEqual(["SELECT", "CLICK"]);
    expect(calls.some((call) => call.command.command === "fill")).toBe(false);
  });

  it("redacts local values from current field state and target criteria", async () => {
    const secret = 'private"value\\with-brackets]';
    const broker = new GoalBroker();
    const originalExecute = broker.execute.bind(broker);
    broker.execute = async (input) =>
      input.command.command === "snapshot" && !broker.clicked
        ? snapshotPayload(
            `- textbox "Email" @e1\n  state @e1 ${JSON.stringify({ editable: true, clickable: true, value: secret })}\n- button "Continue" @e2`,
          )
        : originalExecute(input);
    const decisions = new ScriptedDecisions(["CLICK"]);
    const result = await new JevBrowserGoalRunner({ broker, decisionSource: decisions }).run(
      {
        browserId: BROWSER_ID,
        goal: "Continue to Welcome",
        values: { account: { value: secret } },
        verify: [{ text: "Welcome" }],
      },
      CONTEXT,
    );
    expect(result.status).toBe("passed");
    expect(decisions.requests[0]?.questions.click_target?.criteria["1"]).toMatchObject({
      state: { value: "<value:1>" },
    });
    expect(JSON.stringify(decisions.requests)).not.toContain(JSON.stringify(secret).slice(1, -1));
  });

  it("verifies an unsure DONE instead of stopping as uncertain", async () => {
    const broker = new GoalBroker();
    broker.clicked = true;
    const decisions: TypeSafeDecisionSource = {
      decide: async (request) => ({
        answers: request.questions.goal_kind
          ? { goal_kind: answerFor(request, "goal_kind", "check") }
          : { operation: answerFor(request, "operation", "DONE", 0.2) },
        model: "jev-test",
        latencyMs: 1,
      }),
    };
    const runner = new JevBrowserGoalRunner({ broker, decisionSource: decisions });

    const result = await runner.run(
      {
        goal: "Reach Welcome",
        browserId: BROWSER_ID,
        verify: [{ text: "Welcome" }],
        minConfidence: 0.5,
      },
      CONTEXT,
    );

    expect(result.status).toBe("passed");
    expect(
      broker.calls.findLast((call) => call.command.command !== "screenshot")?.command.command,
    ).toBe("wait");
  });

  it("resolves a value slot from the local environment without sending its value", async () => {
    const broker = new GoalBroker();
    const decisions = new ScriptedDecisions(["FILL", "BLOCKED"]);
    const runner = new JevBrowserGoalRunner({ broker, decisionSource: decisions });
    process.env.PASEO_JEV_TEST_ACCOUNT = "environment-only-value";

    try {
      await runner.run(
        {
          goal: "Fill the account value slot",
          browserId: BROWSER_ID,
          values: {
            account: { env: "PASEO_JEV_TEST_ACCOUNT", description: "test account" },
          },
          verify: [{ text: "Welcome" }],
        },
        CONTEXT,
      );
    } finally {
      delete process.env.PASEO_JEV_TEST_ACCOUNT;
    }

    expect(broker.filledValue).toBe("environment-only-value");
    expect(JSON.stringify(decisions.requests)).not.toContain("environment-only-value");
  });

  it("does not mutate the page below the confidence threshold", async () => {
    const broker = new GoalBroker();
    const decisions: TypeSafeDecisionSource = {
      decide: async (request) => ({
        answers: {
          operation: answerFor(request, "operation", "CLICK", 0.4),
          click_target: answerFor(request, "click_target", "2"),
        },
        model: "jev-test",
        latencyMs: 5,
      }),
    };
    const runner = new JevBrowserGoalRunner({ broker, decisionSource: decisions });

    const result = await runner.run(
      {
        goal: "Continue",
        browserId: BROWSER_ID,
        verify: [{ text: "Welcome" }],
      },
      CONTEXT,
    );

    expect(result.status).toBe("uncertain");
    expect(broker.calls.map((call) => call.command.command)).toEqual([
      "snapshot",
      "snapshot",
      "snapshot",
      "screenshot",
    ]);
    expect(result.message).toContain("2 fresh looks");
    expect(result.message).toContain('button "Continue" @e2');
  });

  it("re-observes after a stale ref without retrying the same mutation", async () => {
    const broker = new GoalBroker();
    broker.staleClicks = true;
    const decisions = new ScriptedDecisions(["CLICK", "BLOCKED"]);
    const runner = new JevBrowserGoalRunner({ broker, decisionSource: decisions });

    const result = await runner.run(
      {
        goal: "Continue",
        browserId: BROWSER_ID,
        verify: [{ text: "Welcome" }],
      },
      CONTEXT,
    );

    expect(result.status).toBe("blocked");
    expect(broker.calls.filter((call) => call.command.command === "click")).toHaveLength(1);
  });

  it("can choose the same target after a stale attempt has been observed again", async () => {
    const broker = new GoalBroker();
    broker.staleClicks = true;
    const execute = broker.execute.bind(broker);
    broker.execute = async (input) => {
      const result = await execute(input);
      if (input.command.command === "click") broker.staleClicks = false;
      return result;
    };
    const decisions = new ScriptedDecisions(["CLICK", "CLICK"]);
    const result = await new JevBrowserGoalRunner({ broker, decisionSource: decisions }).run(
      {
        goal: "Continue to Welcome",
        browserId: BROWSER_ID,
        verify: [{ text: "Welcome" }],
      },
      CONTEXT,
    );
    expect(result.status).toBe("passed");
    expect(result.steps.map((step) => step.outcome)).toEqual(["stale", "executed"]);
    expect(decisions.requests).toHaveLength(2);
    expect(JSON.stringify(decisions.requests[1]?.state)).not.toContain('"outcome":"stale"');
  });
});

describe("JevBrowserGoalRunner activity", () => {
  it("streams phases, the chosen target, and confidence without the filled value", async () => {
    const events: BrowserActivityEvent[] = [];
    const activity = new BrowserActivityHub((event) => events.push(event));
    const runner = new JevBrowserGoalRunner({
      broker: new GoalBroker(),
      decisionSource: new ScriptedDecisions(["FILL", "CLICK", "DONE"]),
      activity,
    });

    await runner.run(
      {
        goal: "Sign in and reach Welcome",
        browserId: BROWSER_ID,
        values: { account: { value: "secret-account", description: "email" } },
        verify: [{ text: "Welcome" }],
      },
      CONTEXT,
    );

    expect(events.map((event) => `${event.step}:${event.phase}`)).toEqual([
      "0:observing",
      "1:observing",
      "1:deciding",
      "1:selected",
      "1:executing",
      "2:observing",
      "2:deciding",
      "2:selected",
      "2:executing",
      "3:observing",
      // The page already shows "Welcome", so the checks pass without asking Jev again.
      "3:verifying",
      "3:finished",
    ]);
    expect(events.every((event) => event.workspaceId === "workspace-1")).toBe(true);
    expect(events.every((event) => event.browserId === BROWSER_ID)).toBe(true);
    expect(new Set(events.map((event) => event.runId)).size).toBe(1);
    expect(events.every((event) => event.kind === "goal" && event.next === undefined)).toBe(true);
    expect(events[3]?.action).toEqual({
      operation: "FILL",
      target: { role: "textbox", name: "Email" },
      valueSlot: "account",
      confidence: 1,
      targetConfidence: 1,
      status: "active",
    });
    expect(events.at(-1)).toMatchObject({
      result: { status: "passed" },
      steps: [
        { operation: "FILL", status: "done" },
        { operation: "CLICK", target: { role: "button", name: "Continue" }, status: "done" },
      ],
    });
    expect(JSON.stringify(events)).not.toContain("secret-account");
  });

  it("pauses on takeover and snapshots the page again before deciding", async () => {
    const log: string[] = [];
    const broker = new GoalBroker();
    const execute = broker.execute.bind(broker);
    broker.execute = async (input) => {
      log.push(input.command.command);
      return execute(input);
    };
    let markPaused!: () => void;
    const paused = new Promise<void>((resolve) => {
      markPaused = resolve;
    });
    const activity = new BrowserActivityHub((event) => {
      if (event.phase === "paused") markPaused();
    });
    const decisions = new ScriptedDecisions(["CLICK", "DONE"]);
    const decide = decisions.decide.bind(decisions);
    decisions.decide = async (request) => {
      log.push("decide");
      if (log.filter((entry) => entry === "decide").length === 1) {
        activity.control({ workspaceId: "workspace-1", browserId: BROWSER_ID, action: "pause" });
      }
      return decide(request);
    };
    const runner = new JevBrowserGoalRunner({ broker, decisionSource: decisions, activity });

    const run = runner.run(
      { goal: "Continue", browserId: BROWSER_ID, verify: [{ text: "Welcome" }] },
      CONTEXT,
    );
    await paused;
    expect(log).toEqual(["snapshot", "decide", "click"]);

    broker.clicked = true;
    activity.control({ workspaceId: "workspace-1", browserId: BROWSER_ID, action: "resume" });
    const result = await run;

    expect(result.status).toBe("passed");
    expect(log).toEqual(["snapshot", "decide", "click", "snapshot", "wait", "screenshot"]);
  });

  it("finishes the activity as failed when the run aborts", async () => {
    const events: BrowserActivityEvent[] = [];
    const broker = new GoalBroker();
    const execute = broker.execute.bind(broker);
    broker.execute = async (input) => {
      if (input.command.command === "snapshot" && broker.clicked) {
        throw new Error("Browser tab closed");
      }
      return execute(input);
    };
    const runner = new JevBrowserGoalRunner({
      broker,
      decisionSource: new ScriptedDecisions(["CLICK"]),
      activity: new BrowserActivityHub((event) => events.push(event)),
    });

    await expect(
      runner.run(
        { goal: "Continue", browserId: BROWSER_ID, verify: [{ text: "Welcome" }] },
        CONTEXT,
      ),
    ).rejects.toThrow("Browser tab closed");
    expect(events.at(-1)).toMatchObject({
      phase: "finished",
      result: { status: "failed", message: "Browser tab closed" },
    });
  });

  it("hands the tab to the user when the page asks for a password no local slot covers", async () => {
    const broker = new GoalBroker();
    const execute = broker.execute.bind(broker);
    broker.execute = async (input) =>
      input.command.command === "snapshot"
        ? snapshotPayload(
            '- textbox "Password" @e1\n  state @e1 {"editable":true,"clickable":true,"secret":true}\n- button "Continue" @e2',
          )
        : execute(input);
    const handoffs: BrowserHandoff[] = [];
    const hub = new BrowserActivityHub(
      () => {},
      (handoff) => handoffs.push(handoff),
    );
    const decisions = new ScriptedDecisions(["CLICK"]);
    const runner = new JevBrowserGoalRunner({
      broker,
      decisionSource: decisions,
      activity: hub,
      handoff: { hub, onEnd: () => {} },
    });

    const result = await runner.run(
      {
        goal: "Sign in and reach Welcome",
        browserId: BROWSER_ID,
        values: { account: { text: "maru@example.com", description: "email" } },
        verify: [{ text: "Welcome" }],
      },
      CONTEXT,
    );

    expect(result.status).toBe("blocked");
    expect(result.message).toContain("handoffId=");
    expect(decisions.requests).toHaveLength(0);
    expect(broker.clicked).toBe(false);
    expect(hub.activeHandoff(BROWSER_ID)).toMatchObject({
      agentId: "agent-1",
      workspaceId: "workspace-1",
      reason: "Sign in needed to continue",
    });
    expect(handoffs.map((handoff) => handoff.status)).toEqual(["active"]);
  });

  it("recognises a password box by name in desktop snapshots without field state", async () => {
    const broker = new GoalBroker();
    const execute = broker.execute.bind(broker);
    broker.execute = async (input) =>
      input.command.command === "snapshot"
        ? snapshotPayload('- textbox "Password" [ref=@e1]\n- button "Continue" [ref=@e2]')
        : execute(input);
    const hub = new BrowserActivityHub(() => {});
    const runner = new JevBrowserGoalRunner({
      broker,
      decisionSource: new ScriptedDecisions(["CLICK"]),
      handoff: { hub, onEnd: () => {} },
    });

    const result = await runner.run(
      { goal: "Sign in and reach Welcome", browserId: BROWSER_ID, verify: [{ text: "Welcome" }] },
      CONTEXT,
    );

    expect(result.status).toBe("blocked");
    expect(hub.activeHandoff(BROWSER_ID)?.reason).toBe("Sign in needed to continue");
    expect(broker.clicked).toBe(false);
  });
});

describe("parseObservedElements", () => {
  it("accepts daemon and desktop snapshot ref formats", () => {
    expect(
      parseObservedElements(
        '- textbox "Email" @e1\n  - button "Continue" [ref=@e2]\n- heading "Ignored"',
      ),
    ).toEqual([
      { index: 1, role: "textbox", name: "Email", ref: "@e1" },
      { index: 2, role: "button", name: "Continue", ref: "@e2" },
    ]);
  });
});

function answerFor(
  request: TypeSafeDecisionRequest,
  questionName: string,
  choice: string,
  confidence = 1,
): TypeSafeChoiceAnswer {
  const choices = Object.keys(request.questions[questionName]?.criteria ?? {});
  if (!choices.includes(choice)) {
    throw new Error(`Choice ${choice} is not available for ${questionName}: ${choices.join(",")}`);
  }
  return {
    choice,
    confidence,
    probabilities: Object.fromEntries(choices.map((entry) => [entry, entry === choice ? 1 : 0])),
  };
}

function snapshotPayload(snapshot: string): BrowserToolsResponsePayload {
  return success({
    command: "snapshot",
    browserId: BROWSER_ID,
    workspaceId: "workspace-1",
    url: "https://example.com/login",
    title: "Example",
    format: "aria-yaml",
    snapshot,
    truncated: false,
    stats: { nodeCount: 2, refCount: 2, textLength: snapshot.length },
  });
}

function success(
  result: Extract<BrowserToolsResponsePayload, { ok: true }>["result"],
): BrowserToolsResponsePayload {
  return { requestId: "request-1", ok: true, result };
}
