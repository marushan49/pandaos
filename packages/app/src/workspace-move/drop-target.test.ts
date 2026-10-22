// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  beginWorkspaceDrag,
  endWorkspaceDrag,
  decodeProjectDropTarget,
  decodeWorkspaceDropTarget,
  dragEndPoint,
  encodeProjectDropTarget,
  encodeWorkspaceDropTarget,
  clearWorkspaceDropHighlight,
  findWorkspaceDropTarget,
  highlightWorkspaceDropTarget,
} from "./drop-target";

describe("workspace drop targets", () => {
  it("round-trips a workspace and rejects malformed values", () => {
    const encoded = encodeWorkspaceDropTarget({ serverId: "srv_1", workspaceId: "wks_2" });
    expect(decodeWorkspaceDropTarget(encoded)).toEqual({ serverId: "srv_1", workspaceId: "wks_2" });
    expect(decodeWorkspaceDropTarget("nope")).toBeNull();
    expect(decodeWorkspaceDropTarget("|wks")).toBeNull();
  });

  it("round-trips a project with a path containing the separator", () => {
    const project = { serverId: "srv_1", projectId: "prj_2", cwd: "/repo/a|b", name: "Repo" };
    expect(decodeProjectDropTarget(encodeProjectDropTarget(project))).toEqual(project);
    expect(decodeProjectDropTarget("srv_1|wks_2")).toBeNull();
    expect(decodeProjectDropTarget(JSON.stringify(["srv_1", "", "/repo", "Repo"]))).toBeNull();
  });

  it("finds where the pointer ended from where the drag started", () => {
    const start = { clientX: 10, clientY: 20 } as unknown as Event;
    expect(dragEndPoint(start, { x: 5, y: 300 })).toEqual({ x: 15, y: 320 });
    expect(dragEndPoint(null, { x: 5, y: 5 })).toBeNull();
  });
});

it("keeps the highlighted drop when sortable rows move on release, but not after the pointer moves", () => {
  const row = document.createElement("div");
  row.setAttribute("data-workspace-drop-target", "srv_1|wks_2");
  document.body.appendChild(row);
  const hits = vi.fn(() => [row]);
  Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: hits });
  const search = { point: { x: 20, y: 30 }, ownListId: null, draggedNode: null };
  try {
    highlightWorkspaceDropTarget({ ...search, isValid: () => true });
    hits.mockReturnValue([]);
    expect(findWorkspaceDropTarget(search)).toEqual({ serverId: "srv_1", workspaceId: "wks_2" });
    expect(findWorkspaceDropTarget({ ...search, point: { x: 20, y: 31 } })).toBeNull();
    row.remove();
    expect(findWorkspaceDropTarget(search)).toBeNull();
  } finally {
    clearWorkspaceDropHighlight();
    row.remove();
    Reflect.deleteProperty(document, "elementsFromPoint");
  }
});

it("resolves a session row inside a project block to its workspace, the rest of the block to the project", () => {
  const block = document.createElement("div");
  block.setAttribute(
    "data-project-drop-target",
    encodeProjectDropTarget({ serverId: "srv", projectId: "prj", cwd: "/repo", name: "Repo" }),
  );
  const header = document.createElement("div");
  const sessions = document.createElement("div");
  sessions.setAttribute("data-workspace-drop-target", "srv|wks_3");
  const sessionRow = document.createElement("div");
  sessions.appendChild(sessionRow);
  block.append(header, sessions);
  document.body.appendChild(block);
  const hits = vi.fn(() => [sessionRow]);
  Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: hits });
  const search = { point: { x: 1, y: 2 }, ownListId: null, draggedNode: null };
  try {
    expect(findWorkspaceDropTarget(search)).toEqual({ serverId: "srv", workspaceId: "wks_3" });
    hits.mockReturnValue([header]);
    expect(findWorkspaceDropTarget(search)).toEqual({
      serverId: "srv",
      projectId: "prj",
      cwd: "/repo",
      name: "Repo",
    });
  } finally {
    block.remove();
    Reflect.deleteProperty(document, "elementsFromPoint");
  }
});

it("uses the released pointer position even when scrolling changes dnd-kit's delta", () => {
  const document = new EventTarget();
  vi.stubGlobal("document", document);
  try {
    const start = Object.assign(new Event("mousedown"), { clientX: 100, clientY: 200 });
    beginWorkspaceDrag(start);
    document.dispatchEvent(Object.assign(new Event("mouseup"), { clientX: 50, clientY: 260 }));
    expect(dragEndPoint(start, { x: -50, y: 378 })).toEqual({ x: 50, y: 260 });
    endWorkspaceDrag();
    document.dispatchEvent(Object.assign(new Event("mousemove"), { clientX: 999, clientY: 999 }));
    expect(dragEndPoint(start, { x: -50, y: 60 })).toEqual({ x: 50, y: 260 });
  } finally {
    endWorkspaceDrag();
    vi.unstubAllGlobals();
  }
});
