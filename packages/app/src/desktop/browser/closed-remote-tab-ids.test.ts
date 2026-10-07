import { describe, expect, it } from "vitest";
import { closedRemoteBrowserTabIds } from "./remote-tab-records";

const bindings = (entries: [string, string | null][]) => new Map(entries);

describe("closedRemoteBrowserTabIds", () => {
  it("closes a mirror whose daemon tab is no longer listed", () => {
    const state = bindings([["remote-1", "remote-1"]]);
    expect(
      closedRemoteBrowserTabIds({ snapshot: state, current: state, listedIds: new Set() }),
    ).toEqual(["remote-1"]);
  });

  it("closes a requested tab whose own local id differs from its daemon id", () => {
    const state = bindings([["local-1", "remote-1"]]);
    expect(
      closedRemoteBrowserTabIds({ snapshot: state, current: state, listedIds: new Set() }),
    ).toEqual(["local-1"]);
  });

  it("closes every unlisted tab and keeps the listed one", () => {
    const state = bindings([
      ["local-1", "remote-1"],
      ["remote-2", "remote-2"],
      ["remote-3", "remote-3"],
    ]);
    expect(
      closedRemoteBrowserTabIds({
        snapshot: state,
        current: state,
        listedIds: new Set(["remote-3"]),
      }),
    ).toEqual(["local-1", "remote-2"]);
  });

  it("keeps a tab that has no daemon tab attached yet", () => {
    const state = bindings([["local-1", null]]);
    expect(
      closedRemoteBrowserTabIds({ snapshot: state, current: state, listedIds: new Set() }),
    ).toEqual([]);
  });

  it("keeps a tab attached or re-attached after the listing request started", () => {
    expect(
      closedRemoteBrowserTabIds({
        snapshot: bindings([["local-1", null]]),
        current: bindings([["local-1", "remote-new"]]),
        listedIds: new Set(),
      }),
    ).toEqual([]);
    expect(
      closedRemoteBrowserTabIds({
        snapshot: bindings([["local-1", "remote-old"]]),
        current: bindings([["local-1", "remote-new"]]),
        listedIds: new Set(),
      }),
    ).toEqual([]);
  });

  it("keeps a tab opened after the listing request started", () => {
    expect(
      closedRemoteBrowserTabIds({
        snapshot: bindings([]),
        current: bindings([["remote-1", "remote-1"]]),
        listedIds: new Set(),
      }),
    ).toEqual([]);
  });
});
