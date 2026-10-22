// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useWorkspaceSessionsDrop } from "./use-workspace-sessions-drop";

const mocks = vi.hoisted(() => ({
  move: vi.fn(),
  createWorkspace: vi.fn(),
  acceptWorkspaceSnapshots: vi.fn(),
  navigate: vi.fn(),
  confirm: vi.fn(),
  toastShow: vi.fn(),
  toastError: vi.fn(),
  agents: new Map<
    string,
    { id: string; workspaceId: string; archivedAt: string | null; title: string }
  >(),
  workspaces: new Map<
    string,
    { id: string; name: string; title: string | null; projectId: string }
  >(),
}));
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, options?: object) => (options ? `${key}${JSON.stringify(options)}` : key),
  }),
}));
vi.mock("@/contexts/toast-context", () => ({
  useToast: () => ({ show: mocks.toastShow, error: mocks.toastError }),
}));
vi.mock("@/utils/confirm-dialog", () => ({ confirmDialog: mocks.confirm }));
vi.mock("@/runtime/host-runtime", () => ({
  getHostRuntimeStore: () => ({
    getClient: () => ({ moveAgentToWorkspace: mocks.move, createWorkspace: mocks.createWorkspace }),
    acceptWorkspaceSnapshots: mocks.acceptWorkspaceSnapshots,
  }),
}));
vi.mock("@/stores/navigation-active-workspace-store", () => ({
  navigateToWorkspace: mocks.navigate,
}));
vi.mock("@/stores/session-store", () => ({
  normalizeWorkspaceDescriptor: (workspace: { id: string }) => workspace,
  useSessionStore: {
    getState: () => ({
      sessions: {
        srv: {
          agents: mocks.agents,
          workspaces: mocks.workspaces,
          queuedMessages: new Map(),
          agentStreamTail: new Map(),
          agentStreamHead: new Map(),
        },
      },
    }),
  },
}));

const source = { serverId: "srv", workspaceId: "source" };
const target = { serverId: "srv", workspaceId: "target" };
const otherProject = { serverId: "srv", projectId: "prj_other", cwd: "/other", name: "Other" };

function dropHandler() {
  return renderHook(() => useWorkspaceSessionsDrop()).result.current;
}

beforeEach(() => {
  mocks.move.mockReset().mockResolvedValue(undefined);
  mocks.createWorkspace
    .mockReset()
    .mockResolvedValue({ workspace: { id: "created" }, error: null });
  mocks.acceptWorkspaceSnapshots.mockReset();
  mocks.navigate.mockReset();
  mocks.confirm.mockReset();
  mocks.toastShow.mockReset();
  mocks.toastError.mockReset();
  mocks.agents.clear();
  mocks.workspaces.clear();
  mocks.workspaces.set("source", { id: "source", name: "Source", title: null, projectId: "prj" });
  mocks.workspaces.set("target", {
    id: "target",
    name: "Target",
    title: "Target title",
    projectId: "prj_other",
  });
  mocks.agents.set("first", {
    id: "first",
    workspaceId: "source",
    archivedAt: null,
    title: "First",
  });
  mocks.agents.set("archived", {
    id: "archived",
    workspaceId: "source",
    archivedAt: "2026-01-01",
    title: "Archived",
  });
});

it("asks before merging and leaves the sessions in place when declined", async () => {
  mocks.confirm.mockResolvedValue(false);

  expect(dropHandler()(source, target)).toBe(true);

  await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(mocks.move).not.toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(mocks.toastShow).not.toHaveBeenCalled();
});

it("names the open sessions and both workspaces, then moves them once confirmed", async () => {
  mocks.confirm.mockResolvedValue(true);

  expect(dropHandler()(source, target)).toBe(true);

  await vi.waitFor(() => expect(mocks.toastShow).toHaveBeenCalledTimes(1));
  expect(mocks.confirm).toHaveBeenCalledWith(
    expect.objectContaining({
      message:
        'sidebar.project.confirmations.moveSessionsMessage{"count":1,"source":"Source","workspace":"Target title"}',
    }),
  );
  expect(mocks.move.mock.calls).toEqual([["first", "target"]]);
});

it("moves an empty workspace without asking", async () => {
  mocks.agents.clear();

  expect(dropHandler()(source, target)).toBe(true);

  await vi.waitFor(() => expect(mocks.toastShow).toHaveBeenCalledTimes(1));
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(mocks.navigate).toHaveBeenCalledTimes(1);
});

it("creates a new workspace in the project it was dropped on and moves the sessions there", async () => {
  mocks.confirm.mockResolvedValue(true);

  expect(dropHandler()(source, otherProject)).toBe(true);

  await vi.waitFor(() => expect(mocks.toastShow).toHaveBeenCalledTimes(1));
  expect(mocks.createWorkspace).toHaveBeenCalledWith({
    source: { kind: "directory", path: "/other", projectId: "prj_other" },
    title: "Source",
  });
  expect(mocks.acceptWorkspaceSnapshots).toHaveBeenCalledWith("srv", [{ id: "created" }]);
  expect(mocks.move.mock.calls).toEqual([["first", "created"]]);
});

it("leaves a drop on its own project to the reorder", () => {
  expect(dropHandler()(source, { ...otherProject, projectId: "prj" })).toBe(false);
  expect(mocks.createWorkspace).not.toHaveBeenCalled();
});
