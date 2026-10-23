import { describe, expect, it } from "vitest";
import { summarize } from "./status";

const base = {
  id: "a",
  sequence: 1001,
  project: "/home/admin/projects/chillbro",
  command: "./gradlew assembleDebug --no-daemon",
  klass: "heavy",
  priority: "normal",
  agent: "agent-123456789",
  worker: "local",
  created: 100,
  waited: 3,
};

describe("summarize", () => {
  it("orders running before queued before finished and keeps the reason", () => {
    const status = summarize({
      jobs: [
        {
          ...base,
          id: "done",
          state: "finished",
          started: 100,
          finished: 160,
          exit: 0,
          measured: { wall: 60, peak_memory: 2 * 1024 ** 3 },
        },
        {
          ...base,
          id: "wait",
          state: "queued",
          wait_reason: "local: gleicher Build-Ordner wie #1000",
        },
        {
          ...base,
          id: "run",
          state: "running",
          started: Date.now() / 1000 - 30,
          usage: { memory_gib: 3.2 },
        },
      ],
      config: { workers: { macbook: false } },
    });
    expect(status.jobs.map((job) => job.id)).toEqual(["run", "wait", "done"]);
    expect(status.jobs[0]).toMatchObject({
      project: "chillbro",
      task: "./gradlew assembleDebug",
      memoryGib: 3.2,
    });
    expect(status.jobs[1].reason).toBe("local: gleicher Build-Ordner wie #1000");
    expect(status.jobs[2]).toMatchObject({ seconds: 60, exit: 0 });
    expect(status.workers).toEqual([
      { name: "Zotac", state: "ready", detail: "Controller" },
      { name: "macbook", state: "disabled", detail: "deaktiviert" },
    ]);
  });

  it("reports a scheduler error instead of an empty queue", () => {
    expect(summarize({ event: "error", error: "unauthorized or too many clients" })).toEqual({
      available: false,
      error: "unauthorized or too many clients",
      jobs: [],
      workers: [],
    });
  });

  it("shows remaining jobs of the old broker and starting jobs as running", () => {
    const status = summarize({
      jobs: [{ ...base, state: "starting", started: Date.now() / 1000 }],
      legacy_jobs: [{ id: "x", sequence: 339, state: "running" }],
    });
    expect(status.jobs.map((job) => [job.state, job.project])).toEqual([
      ["running", "alter Broker"],
      ["running", "chillbro"],
    ]);
  });

  it("explains the worker choice and lists fetched artifacts", () => {
    const status = summarize({
      jobs: [
        {
          ...base,
          state: "finished",
          worker: "macbook",
          exit: 0,
          placement: {
            worker: "macbook",
            eta: 200,
            candidates: [
              { worker: "local", reason: "Heavy-Limit 2 erreicht", eta: 900 },
              { worker: "macbook", eta: 200 },
            ],
          },
          cache: {
            artifacts: {
              paths: ["ios/build/pandaos-export"],
              directory: "/var/lib/x/out/artifacts",
            },
          },
        },
      ],
      workers: {
        macbook: { sampled_at: 1, available_memory: 20 * 1024 ** 3, on_ac: false, battery: 80 },
      },
      config: { workers: { macbook: true } },
    });
    expect(status.jobs[0].placement).toBe(
      "macbook gewählt (local: Heavy-Limit 2 erreicht, macbook: ca. 3 min)",
    );
    expect(status.jobs[0].artifacts).toEqual(["/var/lib/x/out/artifacts/ios/build/pandaos-export"]);
    expect(status.workers[1]).toEqual({
      name: "macbook",
      state: "ready",
      detail: "20 GiB frei · Akku 80 %",
    });
  });
});
