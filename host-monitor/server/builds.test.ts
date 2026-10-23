import { describe, expect, it } from "vitest";
import { product, summarizeBuilds, task } from "./builds";

describe("product", () => {
  it("names the product behind worktrees, release copies and plain checkouts", () => {
    expect(
      product({ project: "/home/admin/projects/chillbro/.worktrees/scheduler-bench" }),
    ).toEqual({
      product: "chillbro",
      worktree: "scheduler-bench",
    });
    expect(
      product({ project: "/home/admin/.local/share/pandaos-releases/7c19ca67f" }).product,
    ).toBe("PandaOS");
    expect(
      product({
        project: "/home/admin/.local/share/pandaos-plugin-releases/build-scheduler-dfcfaba61",
      }).product,
    ).toBe("build-scheduler");
    expect(
      product({ project: "/home/admin/projects/pandaos/.worktrees/x", product: "PandaOS" }),
    ).toEqual({
      product: "PandaOS",
      worktree: "x",
    });
  });
});

describe("task", () => {
  it("describes common build commands", () => {
    expect(task({ command: "./gradlew clean assembleDebug --build-cache" })).toBe(
      "Android APK (debug)",
    );
    expect(
      task({
        command: "/x/gradlew --no-daemon testDebugUnitTest :app:bundleRelease",
        label: "play-release",
      }),
    ).toBe("Play release");
    expect(task({ command: "/x/gradlew --no-daemon testDebugUnitTest :app:bundleRelease" })).toBe(
      "Android AAB (release)",
    );
    expect(task({ command: "cargo test --locked -p michelin --test contracts" })).toBe(
      "Rust tests",
    );
    expect(task({ command: "npm run format:files -- a.md" })).toBe("npm format:files");
    expect(task({ command: "flutter build apk --debug" })).toBe("Flutter apk");
    expect(task({ command: "bash .dev/android-build/build-install-final.sh" })).toBe(
      "build-install-final.sh",
    );
  });
});

describe("summarizeBuilds", () => {
  it("counts active jobs, keeps five recent ones and reports errors", () => {
    const finished = Array.from({ length: 7 }, (_, index) => ({
      id: `f${index}`,
      sequence: index,
      state: "finished",
      project: "/p/app",
      command: "./gradlew assembleDebug",
      exit: 0,
      finished: index,
    }));
    const status = summarizeBuilds({
      jobs: [
        ...finished,
        { id: "q", sequence: 9, state: "queued", project: "/p/app", command: "cargo test" },
      ],
      config: { workers: { macbook: true } },
      workers: { macbook: { error: "offline" } },
    });
    expect(status).toMatchObject({ running: 0, queued: 1 });
    expect(status.jobs).toHaveLength(6);
    expect(status.workers[1]).toEqual({ name: "macbook", state: "offline", detail: "unreachable" });
    expect(summarizeBuilds({ event: "error", error: "denied" })).toMatchObject({
      available: false,
      error: "denied",
    });
  });
});
