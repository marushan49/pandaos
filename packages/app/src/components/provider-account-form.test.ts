import { describe, expect, test, vi } from "vitest";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { openProviderAccountForm } from "./provider-account-form";

describe("provider account form", () => {
  test("preserves the account fields after a failed sign-in and retries with those values", async () => {
    const login = vi.fn<DaemonClient["claudeAccountLogin"]>().mockResolvedValue({
      requestId: "start",
      loginId: null,
      state: { status: "error", message: "Try again" },
    });
    const model = openProviderAccountForm({ name: "Claude", description: "", sharedTeam: false });
    model.applyRuntime({
      client: { claudeAccountLogin: login },
      patchConfig: vi.fn(),
      complete: vi.fn(),
      failureMessage: "Failed",
    });
    model.setName("Team 9elf26");
    model.setDescription("Shared with Timo");
    model.setSharedTeam(true);
    await model.save();
    expect(model.getState()).toMatchObject({
      name: "Team 9elf26",
      description: "Shared with Timo",
      sharedTeam: true,
      error: "Try again",
      busy: false,
      waiting: false,
    });
    await model.save();
    expect(login).toHaveBeenLastCalledWith({
      kind: "start",
      name: "Team 9elf26",
      description: "Shared with Timo",
      sharedTeam: true,
    });
    model.close();
  });

  test("cancels a sign-in that finishes starting after the form was closed", async () => {
    let resolveStart: (
      result: Awaited<ReturnType<DaemonClient["claudeAccountLogin"]>>,
    ) => void = () => {};
    const started = new Promise<Awaited<ReturnType<DaemonClient["claudeAccountLogin"]>>>(
      (resolve) => {
        resolveStart = resolve;
      },
    );
    const login = vi
      .fn<DaemonClient["claudeAccountLogin"]>()
      .mockReturnValueOnce(started)
      .mockResolvedValue({
        requestId: "cancel",
        loginId: "pending",
        state: { status: "cancelled" },
      });
    const complete = vi.fn();
    const model = openProviderAccountForm({ name: "Team", description: "", sharedTeam: true });
    model.applyRuntime({
      client: { claudeAccountLogin: login },
      patchConfig: vi.fn(),
      complete,
      failureMessage: "Failed",
    });
    const saving = model.save();
    model.close();
    resolveStart({
      requestId: "start",
      loginId: "pending",
      state: { status: "waiting", url: "https://claude.com/cai/oauth/authorize" },
    });
    await saving;
    expect(login).toHaveBeenLastCalledWith({ kind: "cancel", loginId: "pending" });
    expect(complete).not.toHaveBeenCalled();
  });
});
