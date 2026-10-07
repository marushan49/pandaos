import { describe, expect, it } from "vitest";
import {
  fanoutNeedsConfirmation,
  isFanoutSelectable,
  resolveFanoutExtras,
  toggleFanoutModel,
  type FanoutModelRef,
} from "./model-fanout";

const opus: FanoutModelRef = { provider: "claude", modelId: "opus" };
const sonnet: FanoutModelRef = { provider: "claude", modelId: "sonnet" };
const gpt: FanoutModelRef = { provider: "codex", modelId: "gpt-6" };
const luna: FanoutModelRef = { provider: "codex", modelId: "luna" };
const fifth: FanoutModelRef = { provider: "opencode", modelId: "deepseek" };
const astra: FanoutModelRef = { provider: "codex", modelId: "gpt-6-astra" };

describe("model fan-out selection", () => {
  it("keeps exactly one model when nothing is ticked", () => {
    expect(toggleFanoutModel({ primary: opus, extras: [] }, opus)).toEqual({
      primary: opus,
      extras: [],
    });
  });

  it("adds and removes extra models", () => {
    const added = toggleFanoutModel({ primary: opus, extras: [] }, sonnet);
    expect(added.extras).toEqual([sonnet]);
    expect(toggleFanoutModel(added, sonnet).extras).toEqual([]);
  });

  it("promotes the first extra when the primary is unticked", () => {
    const result = toggleFanoutModel({ primary: opus, extras: [sonnet, gpt] }, opus);
    expect(result).toEqual({ primary: sonnet, extras: [gpt] });
  });

  it("allows at most four models", () => {
    const full = { primary: opus, extras: [sonnet, gpt, luna] };
    expect(toggleFanoutModel(full, fifth)).toEqual(full);
  });

  it("never selects astra models", () => {
    expect(isFanoutSelectable(astra)).toBe(false);
    expect(isFanoutSelectable(gpt, "GPT-6 Astra")).toBe(false);
    expect(toggleFanoutModel({ primary: opus, extras: [] }, astra).extras).toEqual([]);
    expect(resolveFanoutExtras(opus, [astra, sonnet])).toEqual([sonnet]);
  });

  it("drops extras that equal the primary and duplicates", () => {
    expect(resolveFanoutExtras(opus, [opus, sonnet, sonnet])).toEqual([sonnet]);
  });

  it("asks for confirmation only above two models", () => {
    expect(fanoutNeedsConfirmation(1)).toBe(false);
    expect(fanoutNeedsConfirmation(2)).toBe(false);
    expect(fanoutNeedsConfirmation(3)).toBe(true);
  });
});
