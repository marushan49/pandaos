import { ActivityIndicator, View, type ViewStyle } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, CircleAlert } from "@/components/icons/ui-icons";
import { ProjectIconView } from "@/components/project-icon-view";
import { getStatusBucketLabel } from "@/hooks/sidebar-status-view-model";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";
import {
  getProjectStatusBadgeContent,
  type ProjectStatusBadgeContent,
  type ProjectStatusBadgeDotBucket,
} from "@/utils/project-status-badge-content";
import { projectIconPlaceholderLabelFromDisplayName } from "@/utils/project-display-name";
import { getStatusDotColor } from "@/utils/status-dot-color";
import {
  STATUS_INDICATOR_ALERT_SIZE,
  STATUS_INDICATOR_FILLED_DOT_SIZE,
} from "@/utils/status-indicator-geometry";
import { StatusRing } from "@/components/status-ring";
import { getStatusRingOffset } from "@/components/status-ring/geometry";
import type { SidebarSurfaceBackdrop } from "@/styles/surface-backdrop";

const STATUS_BADGE_SIZE = 12;
const STATUS_BADGE_OFFSET = -4;
const LEADING_SLOT_HEIGHT = 20;

const ThemedActivityIndicator = withUnistyles(ActivityIndicator);
const ThemedCircleAlert = withUnistyles(CircleAlert);

const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});
const needsInputColorMapping = (theme: Theme) => ({
  color: theme.colors.surface0,
  fill: getStatusDotColor({ theme, bucket: "needs_input" }) ?? undefined,
});

export function ProjectLeadingVisual({
  displayName,
  iconDataUri,
  statusBucket,
  projectViewKey,
  backdrop,
  chevron = null,
  showChevron = false,
  isArchiving = false,
}: {
  displayName: string;
  iconDataUri: string | null;
  statusBucket: SidebarStateBucket | null;
  projectViewKey: string;
  backdrop: SidebarSurfaceBackdrop;
  chevron?: "expand" | "collapse" | null;
  showChevron?: boolean;
  isArchiving?: boolean;
}) {
  if (showChevron && chevron !== null) {
    return (
      <View style={styles.projectLeadingVisualSlot}>
        <ProjectInlineChevron chevron={chevron} />
      </View>
    );
  }

  if (isArchiving) {
    return (
      <View style={styles.projectLeadingVisualSlot} testID="project-status-indicator-archiving">
        <ThemedActivityIndicator size={8} uniProps={foregroundMutedColorMapping} />
      </View>
    );
  }

  return (
    <ProjectStatusIndicator
      iconDataUri={iconDataUri}
      displayName={displayName}
      projectViewKey={projectViewKey}
      statusBucket={statusBucket}
      backdrop={backdrop}
    />
  );
}

export function ProjectStatusIndicator({
  iconDataUri,
  displayName,
  projectViewKey,
  statusBucket,
  backdrop,
  loading = false,
  testID,
}: {
  iconDataUri: string | null;
  displayName: string;
  projectViewKey: string;
  statusBucket: SidebarStateBucket | null;
  backdrop: SidebarSurfaceBackdrop;
  loading?: boolean;
  testID?: string;
}) {
  const placeholderInitial = projectIconPlaceholderLabelFromDisplayName(displayName)
    .charAt(0)
    .toUpperCase();
  const badgeBucket = loading ? "running" : statusBucket;
  const badgeContent = getProjectStatusBadgeContent(badgeBucket);

  return (
    <View
      style={styles.projectLeadingVisualSlot}
      testID={
        testID ??
        (statusBucket && statusBucket !== "done"
          ? `project-status-indicator-${statusBucket}`
          : "project-icon-only")
      }
    >
      <View style={styles.projectIconBox}>
        <ProjectIcon
          iconDataUri={iconDataUri}
          placeholderInitial={placeholderInitial}
          projectViewKey={projectViewKey}
        />
        {badgeContent === null || badgeBucket === null ? null : (
          <ProjectStatusBadge
            content={badgeContent}
            statusBucket={badgeBucket}
            backdrop={backdrop}
          />
        )}
      </View>
    </View>
  );
}

function ProjectStatusBadge({
  content,
  statusBucket,
  backdrop,
}: {
  content: ProjectStatusBadgeContent;
  statusBucket: SidebarStateBucket;
  backdrop: SidebarSurfaceBackdrop;
}) {
  const { t } = useTranslation();
  if (content.kind === "dot" && content.bucket === "running") {
    return (
      <View
        role="status"
        accessibilityLabel={getStatusBucketLabel(statusBucket, t)}
        style={styles.statusRingAnchor}
        testID="project-status-badge"
      >
        <StatusRing backdrop={backdrop} />
      </View>
    );
  }
  return (
    <View
      role="status"
      accessibilityLabel={getStatusBucketLabel(statusBucket, t)}
      style={[styles.statusBadge, getStatusBadgeBackdropStyle(backdrop)]}
      testID="project-status-badge"
    >
      {content.kind === "alert" ? (
        <ThemedCircleAlert size={STATUS_INDICATOR_ALERT_SIZE} uniProps={needsInputColorMapping} />
      ) : (
        <ProjectStatusDot bucket={content.bucket} />
      )}
    </View>
  );
}

function getStatusBadgeBackdropStyle(backdrop: SidebarSurfaceBackdrop): ViewStyle {
  switch (backdrop) {
    case "surfaceSidebar":
      return styles.statusBadgeOnSidebar;
    case "surfaceSidebarHover":
      return styles.statusBadgeOnSidebarHover;
    case "surfaceSidebarSelected":
      return styles.statusBadgeOnSidebarSelected;
    case "surface2":
      return styles.statusBadgeOnSurface2;
  }
}

function ProjectStatusDot({ bucket }: { bucket: ProjectStatusBadgeDotBucket }) {
  return <View testID="project-status-dot" style={getStatusDotColorStyle(bucket)} />;
}

function ProjectIcon({
  iconDataUri,
  placeholderInitial,
  projectViewKey,
}: {
  iconDataUri: string | null;
  placeholderInitial: string;
  projectViewKey: string;
}) {
  return (
    <ProjectIconView
      iconDataUri={iconDataUri}
      initial={placeholderInitial}
      projectViewKey={projectViewKey}
      size={ICON_SIZE.md}
      textStyle={styles.projectIconFallbackText}
    />
  );
}

function ProjectInlineChevron({ chevron }: { chevron: "expand" | "collapse" | null }) {
  if (chevron === null) {
    return null;
  }
  if (chevron === "collapse") {
    return <ChevronDown size={14} color="#9ca3af" />;
  }
  return <ChevronRight size={14} color="#9ca3af" />;
}

function getStatusDotColorStyle(bucket: ProjectStatusBadgeDotBucket): ViewStyle {
  if (bucket === "failed") return styles.statusDotFailed;
  if (bucket === "running") return styles.statusDotRunning;
  return styles.statusDotAttention;
}

const styles = StyleSheet.create((theme) => {
  const statusDot = (bucket: ProjectStatusBadgeDotBucket) =>
    ({
      width: STATUS_INDICATOR_FILLED_DOT_SIZE,
      height: STATUS_INDICATOR_FILLED_DOT_SIZE,
      borderRadius: theme.borderRadius.full,
      backgroundColor: getStatusDotColor({ theme, bucket }) ?? undefined,
    }) as const;

  return {
    projectLeadingVisualSlot: {
      width: theme.iconSize.md,
      height: LEADING_SLOT_HEIGHT,
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    projectIconBox: {
      position: "relative",
      width: theme.iconSize.md,
      height: theme.iconSize.md,
    },
    projectIconFallbackText: {
      fontSize: 9,
    },
    statusBadge: {
      position: "absolute",
      right: STATUS_BADGE_OFFSET,
      bottom: STATUS_BADGE_OFFSET,
      width: STATUS_BADGE_SIZE,
      height: STATUS_BADGE_SIZE,
      borderRadius: theme.borderRadius.full,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    statusRingAnchor: {
      position: "absolute",
      right: getStatusRingOffset(STATUS_BADGE_OFFSET, STATUS_BADGE_SIZE),
      bottom: getStatusRingOffset(STATUS_BADGE_OFFSET, STATUS_BADGE_SIZE),
    },
    statusBadgeOnSidebar: { backgroundColor: theme.colors.surfaceSidebar },
    statusBadgeOnSidebarHover: { backgroundColor: theme.colors.surfaceSidebarHover },
    statusBadgeOnSidebarSelected: { backgroundColor: theme.colors.surfaceSidebarSelected },
    statusBadgeOnSurface2: { backgroundColor: theme.colors.surface2 },
    statusDotRunning: statusDot("running"),
    statusDotFailed: statusDot("failed"),
    statusDotAttention: statusDot("attention"),
  };
});
