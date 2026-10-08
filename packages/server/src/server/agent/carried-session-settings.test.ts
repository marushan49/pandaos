import { expect, it } from "vitest";
import { carriedSessionSettings } from "./carried-session-settings.js";

const current = {
  modeId: "full-access",
  thinkingOptionId: "high",
  featureValues: { fast_mode: true },
};

it("keeps mode, thinking and features on a sibling profile that offers the thinking option", () => {
  expect(
    carriedSessionSettings(current, { sameFamily: true, thinkingOptionIds: ["medium", "high"] }),
  ).toEqual(current);
});

it("keeps everything on a sibling profile whose catalog is not loaded yet", () => {
  expect(carriedSessionSettings(current, { sameFamily: true })).toEqual(current);
});

it("drops only the thinking option the sibling model does not offer", () => {
  expect(carriedSessionSettings(current, { sameFamily: true, thinkingOptionIds: ["low"] })).toEqual(
    { ...current, thinkingOptionId: undefined },
  );
});

it("carries nothing to another provider family", () => {
  expect(
    carriedSessionSettings(current, { sameFamily: false, thinkingOptionIds: ["high"] }),
  ).toEqual({});
});
