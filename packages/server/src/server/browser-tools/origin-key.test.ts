import { describe, expect, test } from "vitest";

import { keepNewestPerApplication, originKey } from "./origin-key.js";

describe("originKey", () => {
  test("treats loopback spellings as one application", () => {
    expect(originKey("http://localhost:4040/de/auth")).toBe(originKey("http://127.0.0.1:4040/x"));
    expect(originKey("http://localhost:4040/")).not.toBe(originKey("http://localhost:4041/"));
    expect(originKey("not a url")).toBeNull();
  });
});

describe("keepNewestPerApplication", () => {
  const tab = (browserId: string, workspaceId: string, url: string) => ({
    browserId,
    workspaceId,
    profile: "default",
    url,
  });

  test("keeps the newest tab per workspace and application", () => {
    const kept = keepNewestPerApplication([
      tab("1", "w1", "http://localhost:4040/a"),
      tab("2", "w1", "http://127.0.0.1:4040/b"),
      tab("3", "w2", "http://localhost:4040/a"),
      tab("4", "w1", "https://example.com/"),
      tab("5", "w1", "garbage"),
    ]);
    expect(kept.map((entry) => entry.browserId).sort()).toEqual(["2", "3", "4", "5"]);
  });
});
