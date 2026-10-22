export const DROP_TARGET_ATTRIBUTE = "data-workspace-drop-target";
export const PROJECT_DROP_TARGET_ATTRIBUTE = "data-project-drop-target";
export const DRAG_LIST_ATTRIBUTE = "data-drag-list";

export interface WorkspaceDropTarget {
  serverId: string;
  workspaceId: string;
}

export interface ProjectDropTarget {
  serverId: string;
  projectId: string;
  cwd: string;
  name: string;
}

export type SidebarDropTarget = WorkspaceDropTarget | ProjectDropTarget;

export function encodeWorkspaceDropTarget(target: WorkspaceDropTarget): string {
  return `${target.serverId}|${target.workspaceId}`;
}

export function decodeWorkspaceDropTarget(
  value: string | null | undefined,
): WorkspaceDropTarget | null {
  if (!value) return null;
  const separator = value.indexOf("|");
  if (separator <= 0 || separator === value.length - 1) return null;
  return { serverId: value.slice(0, separator), workspaceId: value.slice(separator + 1) };
}

export function encodeProjectDropTarget(target: ProjectDropTarget): string {
  return JSON.stringify([target.serverId, target.projectId, target.cwd, target.name]);
}

export function decodeProjectDropTarget(
  value: string | null | undefined,
): ProjectDropTarget | null {
  if (!value) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 4) return null;
  const [serverId, projectId, cwd, name] = parsed as unknown[];
  if (typeof serverId !== "string" || typeof projectId !== "string") return null;
  if (typeof cwd !== "string" || typeof name !== "string") return null;
  if (!serverId || !projectId || !cwd) return null;
  return { serverId, projectId, cwd, name };
}

export function isWorkspaceDropTarget(target: SidebarDropTarget): target is WorkspaceDropTarget {
  return "workspaceId" in target;
}

function decodeDropTarget(element: Element): SidebarDropTarget | null {
  const workspace = element.getAttribute(DROP_TARGET_ATTRIBUTE);
  if (workspace !== null) return decodeWorkspaceDropTarget(workspace);
  return decodeProjectDropTarget(element.getAttribute(PROJECT_DROP_TARGET_ATTRIBUTE));
}

function pointerPoint(event: Event | null): { x: number; y: number } | null {
  const start = event as (Partial<MouseEvent> & Partial<TouchEvent>) | null;
  const touch = start?.changedTouches?.[0] ?? start?.touches?.[0];
  const x = touch?.clientX ?? start?.clientX;
  const y = touch?.clientY ?? start?.clientY;
  return typeof x === "number" && typeof y === "number" ? { x, y } : null;
}

let livePointer: { x: number; y: number } | null = null;
const POINTER_EVENTS = [
  "pointermove",
  "pointerup",
  "mousemove",
  "mouseup",
  "touchmove",
  "touchend",
];
function updateLivePointer(event: Event): void {
  livePointer = pointerPoint(event);
}

export function beginWorkspaceDrag(event: Event): void {
  endWorkspaceDrag();
  livePointer = pointerPoint(event);
  if (!livePointer || typeof document === "undefined") return;
  for (const name of POINTER_EVENTS)
    document.addEventListener(name, updateLivePointer, { capture: true });
}

export function endWorkspaceDrag(): void {
  livePointer = null;
  if (typeof document === "undefined") return;
  for (const name of POINTER_EVENTS)
    document.removeEventListener(name, updateLivePointer, { capture: true });
}

export function dragEndPoint(
  activatorEvent: Event | null,
  delta: { x: number; y: number },
): { x: number; y: number } | null {
  // dnd-kit adds scroll displacement to delta; workspace hit testing needs viewport coordinates.
  if (livePointer) return livePointer;
  const start = pointerPoint(activatorEvent);
  return start ? { x: start.x + delta.x, y: start.y + delta.y } : null;
}

interface DropSearch {
  point: { x: number; y: number } | null;
  ownListId: string | null;
  draggedNode: Element | null;
}

function findWorkspaceDropElement(
  input: DropSearch,
): { element: Element; target: SidebarDropTarget } | null {
  const { point, ownListId, draggedNode } = input;
  if (!point || typeof document === "undefined" || !document.elementsFromPoint) return null;
  for (const element of document.elementsFromPoint(point.x, point.y)) {
    if (draggedNode?.contains(element)) continue;
    const found = element.closest(`[${DROP_TARGET_ATTRIBUTE}],[${PROJECT_DROP_TARGET_ATTRIBUTE}]`);
    if (!found) continue;
    const list = found.closest(`[${DRAG_LIST_ATTRIBUTE}]`);
    if (ownListId && list?.getAttribute(DRAG_LIST_ATTRIBUTE) === ownListId) return null;
    const target = decodeDropTarget(found);
    return target ? { element: found, target } : null;
  }
  return null;
}

export function findWorkspaceDropTarget(input: DropSearch): SidebarDropTarget | null {
  if (
    highlighted?.isConnected &&
    highlightedDrop?.point?.x === input.point?.x &&
    highlightedDrop?.point?.y === input.point?.y &&
    highlightedDrop?.ownListId === input.ownListId &&
    highlightedDrop?.draggedNode === input.draggedNode
  ) {
    return highlightedDrop.target;
  }
  return findWorkspaceDropElement(input)?.target ?? null;
}

// Drag feedback is painted straight onto the drop target element: a drag moves every frame
// and must not re-render the sidebar to show where it would land.
const DROP_STATE_ATTRIBUTE = "data-drop-state";
const DROP_FEEDBACK_CSS = `
[${DROP_STATE_ATTRIBUTE}="valid"] { outline: 2px solid #3b82f6; outline-offset: -2px; border-radius: 8px; background-color: rgba(59, 130, 246, 0.14); }
[${DROP_STATE_ATTRIBUTE}="invalid"] { outline: 2px dashed #d93025; outline-offset: -2px; border-radius: 8px; cursor: not-allowed; opacity: 0.6; }
[${DROP_STATE_ATTRIBUTE}="landed"] { outline: 2px solid #188038; outline-offset: -2px; border-radius: 8px; background-color: rgba(24, 128, 56, 0.16); transition: background-color 0.3s; }
`;
let highlighted: Element | null = null;
let highlightedDrop: (DropSearch & { target: SidebarDropTarget }) | null = null;

function ensureDropFeedbackStyles(): void {
  if (typeof document === "undefined" || document.getElementById("paseo-drop-feedback")) return;
  const style = document.createElement("style");
  style.id = "paseo-drop-feedback";
  style.textContent = DROP_FEEDBACK_CSS;
  document.head.appendChild(style);
}

export function clearWorkspaceDropHighlight(): void {
  highlighted?.removeAttribute(DROP_STATE_ATTRIBUTE);
  highlighted = null;
  highlightedDrop = null;
}

export function highlightWorkspaceDropTarget(
  input: DropSearch & { isValid: (target: SidebarDropTarget) => boolean },
): void {
  const found = findWorkspaceDropElement(input);
  if (found?.element !== highlighted) clearWorkspaceDropHighlight();
  if (!found) return;
  ensureDropFeedbackStyles();
  found.element.setAttribute(
    DROP_STATE_ATTRIBUTE,
    input.isValid(found.target) ? "valid" : "invalid",
  );
  highlighted = found.element;
  highlightedDrop = { ...input, target: found.target };
}

/** Briefly lights up the workspace a drop landed in, so the eye follows the move. */
export function flashLandedWorkspace(target: WorkspaceDropTarget): void {
  if (typeof document === "undefined") return;
  ensureDropFeedbackStyles();
  const value = encodeWorkspaceDropTarget(target).replace(/["\\]/g, "\\$&");
  const matches = [...document.querySelectorAll(`[${DROP_TARGET_ATTRIBUTE}="${value}"]`)];
  // A project header targets its first workspace too; light the workspace row, not the block.
  const innermost = matches.filter(
    (element) => !matches.some((other) => other !== element && element.contains(other)),
  );
  for (const element of innermost) {
    element.setAttribute(DROP_STATE_ATTRIBUTE, "landed");
    setTimeout(() => {
      if (element.getAttribute(DROP_STATE_ATTRIBUTE) === "landed") {
        element.removeAttribute(DROP_STATE_ATTRIBUTE);
      }
    }, 1600);
  }
}
