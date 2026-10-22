import type { WorkspaceTabTarget } from "@/workspace-tabs/model";
import type { PaneHost } from "@/panels/panel-manifest";

export type WorkspaceTabCloseButtonPolicy = "all";

export function workspaceIconOnlyTabs(
  kinds: WorkspaceTabTarget["kind"][],
  host: PaneHost,
): boolean[] {
  if (host === "main") return kinds.map(() => false);
  return kinds.map((kind) => {
    if (kind === "terminal" || kind === "browser")
      return kinds.filter((other) => other === kind).length === 1;
    return (
      kind === "files" ||
      kind === "changes_tree" ||
      kind === "evidence" ||
      kind === "insights" ||
      kind === "tasks" ||
      kind === "plugin" ||
      kind === "pull_request"
    );
  });
}

export interface WorkspaceTabLayoutMetrics {
  rowHorizontalInset: number;
  actionsReservedWidth: number;
  rowPaddingHorizontal: number;
  tabGap: number;
  minTabWidth: number;
  maxTabWidth: number;
  tabIconWidth: number;
  tabContentGap: number;
  tabHorizontalPadding: number;
  closeButtonWidth: number;
}

export interface WorkspaceTabLayoutInput {
  viewportWidth: number;
  tabLabelWidths: number[];
  iconOnlyTabs?: boolean[];
  metrics: WorkspaceTabLayoutMetrics;
}

export interface WorkspaceTabLayoutItem {
  width: number;
  showLabel: boolean;
}

export interface WorkspaceTabLayoutResult {
  items: WorkspaceTabLayoutItem[];
  closeButtonPolicy: WorkspaceTabCloseButtonPolicy;
  requiresHorizontalScrollFallback: boolean;
}

export function retainWorkspaceTabMeasuredWidth(
  currentWidth: number,
  measuredWidth: number,
): number {
  if (measuredWidth <= 0 || Math.abs(currentWidth - measuredWidth) <= 1) {
    return currentWidth;
  }
  return measuredWidth;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function computeWorkspaceTabLayout(
  input: WorkspaceTabLayoutInput,
): WorkspaceTabLayoutResult {
  const tabCount = input.tabLabelWidths.length;
  if (tabCount === 0) {
    return {
      items: [],
      closeButtonPolicy: "all",
      requiresHorizontalScrollFallback: false,
    };
  }

  const availableWidth = Math.max(
    0,
    input.viewportWidth - input.metrics.rowHorizontalInset * 2 - input.metrics.actionsReservedWidth,
  );
  const rowOverhead =
    input.metrics.rowPaddingHorizontal * 2 + Math.max(tabCount - 1, 0) * input.metrics.tabGap;
  const availableTabsWidth = Math.max(0, availableWidth - rowOverhead);
  const tabChromeWidth =
    input.metrics.tabIconWidth +
    input.metrics.tabContentGap +
    input.metrics.tabHorizontalPadding * 2 +
    input.metrics.closeButtonWidth;
  const minimumWidths = input.tabLabelWidths.map((_, index) =>
    input.iconOnlyTabs?.[index] ? 40 : input.metrics.minTabWidth,
  );
  const naturalWidths = input.tabLabelWidths.map((labelWidth, index) =>
    input.iconOnlyTabs?.[index]
      ? minimumWidths[index]!
      : clamp(tabChromeWidth + labelWidth, input.metrics.minTabWidth, input.metrics.maxTabWidth),
  );
  const naturalTotalWidth = naturalWidths.reduce((total, width) => total + width, 0);
  const minimumTotalWidth = minimumWidths.reduce((total, width) => total + width, 0);
  const requiresHorizontalScrollFallback = availableTabsWidth < minimumTotalWidth;

  let resolvedWidths = naturalWidths;
  if (requiresHorizontalScrollFallback) {
    resolvedWidths = minimumWidths;
  } else if (naturalTotalWidth > availableTabsWidth) {
    const widthToRemove = naturalTotalWidth - availableTabsWidth;
    const shrinkCapacity = naturalTotalWidth - minimumTotalWidth;
    const shrinkRatio = widthToRemove / shrinkCapacity;
    resolvedWidths = naturalWidths.map(
      (width, index) => width - (width - minimumWidths[index]!) * shrinkRatio,
    );
  }

  const roundedWidths = resolvedWidths.map((width, index) =>
    Math.round(clamp(width, minimumWidths[index]!, input.metrics.maxTabWidth)),
  );

  return {
    items: roundedWidths.map((width, index) => ({
      width,
      showLabel: !input.iconOnlyTabs?.[index] && width > tabChromeWidth,
    })),
    closeButtonPolicy: "all",
    requiresHorizontalScrollFallback,
  };
}
