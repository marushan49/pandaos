import { MoreVertical, Pause, Pencil, Play, RotateCw, Trash2 } from "@/components/icons/ui-icons";
import { useCallback, useState, type ReactElement } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { useProviderIcon } from "@/components/provider-icons";
import { isNative } from "@/constants/platform";
import { useIsCompactFormFactor } from "@/constants/layout";
import { settingsStyles } from "@/styles/settings";
import type { Theme } from "@/styles/theme";
import type { ScheduleDerivedState } from "@/schedules/schedule-derivation";
import {
  formatCadence,
  formatNextRun,
  resolveScheduleTitle,
  scheduleProductName,
} from "@/utils/schedule-format";
import { useTimeAgo } from "@/hooks/use-time-ago";
import type { ScheduleSummary } from "@getpaseo/protocol/schedule/types";

const ThemedPencil = withUnistyles(Pencil);
const ThemedPause = withUnistyles(Pause);
const ThemedPlay = withUnistyles(Play);
const ThemedRotateCw = withUnistyles(RotateCw);
const ThemedTrash2 = withUnistyles(Trash2);
const ThemedKebab = withUnistyles(MoreVertical);

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const destructiveColorMapping = (theme: Theme) => ({ color: theme.colors.destructive });

const MENU_ICON_SIZE = 14;
const PROVIDER_ICON_SIZE = 16;

export interface ScheduleRowPending {
  pause?: boolean;
  resume?: boolean;
  runNow?: boolean;
  delete?: boolean;
}

export interface ScheduleRowActions {
  onEdit: () => void;
  onPause: () => void;
  onResume: () => void;
  onRunNow: () => void;
  onDelete: () => void;
}

interface ScheduleRowProps extends ScheduleRowActions {
  serverId: string;
  schedule: ScheduleSummary;
  targetLabel: string;
  provider: string | null;
  state: ScheduleDerivedState;
  serverName?: string;
  singleHost?: boolean;
  pending?: ScheduleRowPending;
  isFirst: boolean;
}

function stateBadge(state: ScheduleDerivedState): {
  label: string;
  variant: "success" | "error" | "muted";
} {
  switch (state) {
    case "active":
      return { label: "Active", variant: "success" };
    case "blocked":
      return { label: "Not running", variant: "error" };
    case "paused":
      return { label: "Paused", variant: "muted" };
    case "expired":
      return { label: "Expired", variant: "muted" };
    case "finished":
      return { label: "Finished", variant: "muted" };
    case "targetGone":
      return { label: "Target gone", variant: "error" };
  }
}

function buildMeta(input: {
  schedule: ScheduleSummary;
  state: ScheduleDerivedState;
  createdAgo: string;
  lastRunAgo: string;
  serverName: string | undefined;
  singleHost: boolean;
}): string {
  const { schedule, state, serverName, singleHost } = input;
  const parts = [
    formatCadence(schedule.cadence),
    `Created ${input.createdAgo}`,
    schedule.lastRunAt ? `Last run ${input.lastRunAgo}` : "Never run",
  ];
  if (state === "active") {
    const next = formatNextRun(schedule.nextRunAt);
    if (next) {
      parts.push(`Next run ${next}`);
    }
  }
  if (state === "blocked" && schedule.automationBlockedReason) {
    parts.push(schedule.automationBlockedReason);
  }
  if (serverName && !singleHost) {
    parts.unshift(serverName);
  }
  return parts.join(", ");
}

function ScheduleMeta({
  schedule,
  state,
  serverName,
  singleHost,
}: {
  schedule: ScheduleSummary;
  state: ScheduleDerivedState;
  serverName: string | undefined;
  singleHost: boolean;
}) {
  const createdAgo = useTimeAgo(new Date(schedule.createdAt));
  const lastRunAgo = useTimeAgo(schedule.lastRunAt ? new Date(schedule.lastRunAt) : null);
  const meta = buildMeta({ schedule, state, createdAgo, lastRunAgo, serverName, singleHost });
  let error = schedule.lastRun?.status === "failed" ? schedule.lastRun.error : null;
  if (state === "blocked") error = schedule.automationBlockedReason ?? null;
  return (
    <>
      <Text style={settingsStyles.rowHint} numberOfLines={1}>
        {meta}
      </Text>
      {error ? (
        <Text
          style={styles.lastRunError}
          numberOfLines={1}
          testID={`schedule-row-error-${schedule.id}`}
        >
          {error}
        </Text>
      ) : null}
    </>
  );
}

function ProviderGlyph({
  provider,
  serverId,
}: {
  provider: string | null;
  serverId: string;
}): ReactElement | null {
  const Icon = useProviderIcon(provider ?? "", serverId);
  if (!provider) {
    return null;
  }
  return <Icon size={PROVIDER_ICON_SIZE} color={styles.providerIcon.color} />;
}

export function ScheduleRow({
  serverId,
  schedule,
  targetLabel,
  provider,
  state,
  serverName,
  singleHost,
  pending,
  isFirst,
  onEdit,
  onPause,
  onResume,
  onRunNow,
  onDelete,
}: ScheduleRowProps): ReactElement {
  const isCompact = useIsCompactFormFactor();
  const [isHovered, setIsHovered] = useState(false);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);

  const title = resolveScheduleTitle(schedule);
  const productName = scheduleProductName(schedule);
  const badge = stateBadge(state);
  const canRun = schedule.target.type === "new-agent" && (state === "active" || state === "paused");

  const rowStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      settingsStyles.row,
      styles.row,
      !isFirst && settingsStyles.rowBorder,
      isHovered && !isCompact && styles.rowHovered,
      pressed && styles.rowPressed,
    ],
    [isFirst, isHovered, isCompact],
  );

  return (
    <View
      style={styles.rowContainer}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <Pressable
        style={rowStyle}
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${productName.toLowerCase()} ${title}`}
        testID={`schedule-row-${schedule.id}`}
      >
        <View style={styles.main}>
          <View style={styles.leading}>
            <ProviderGlyph provider={provider} serverId={serverId} />
          </View>
          <View style={styles.textGroup}>
            <Text style={settingsStyles.rowTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.target} numberOfLines={1}>
              {targetLabel}
            </Text>
            <ScheduleMeta
              schedule={schedule}
              state={state}
              serverName={serverName}
              singleHost={singleHost ?? false}
            />
          </View>
        </View>

        <View style={styles.trailing}>
          <StatusBadge label={badge.label} variant={badge.variant} />
          <ScheduleKebabMenu
            schedule={schedule}
            canRun={canRun}
            pending={pending}
            onEdit={onEdit}
            onPause={onPause}
            onResume={onResume}
            onRunNow={onRunNow}
            onDelete={onDelete}
          />
        </View>
      </Pressable>
    </View>
  );
}

const editLeading = <ThemedPencil size={MENU_ICON_SIZE} uniProps={mutedColorMapping} />;
const pauseLeading = <ThemedPause size={MENU_ICON_SIZE} uniProps={mutedColorMapping} />;
const resumeLeading = <ThemedPlay size={MENU_ICON_SIZE} uniProps={mutedColorMapping} />;
const runLeading = <ThemedRotateCw size={MENU_ICON_SIZE} uniProps={mutedColorMapping} />;
const deleteLeading = <ThemedTrash2 size={MENU_ICON_SIZE} uniProps={destructiveColorMapping} />;

function ScheduleExecutionMenuItems({
  schedule,
  canRun,
  pending,
  onPause,
  onResume,
  onRunNow,
}: Pick<ScheduleRowProps, "schedule" | "pending" | "onPause" | "onResume" | "onRunNow"> & {
  canRun: boolean;
}): ReactElement | null {
  if (schedule.target.type === "agent") {
    return null;
  }

  let cadenceAction: ReactElement;
  if (schedule.status === "paused") {
    cadenceAction = (
      <DropdownMenuItem
        leading={resumeLeading}
        disabled={!canRun}
        status={pending?.resume ? "pending" : "idle"}
        pendingLabel="Resuming..."
        onSelect={onResume}
        testID={`schedule-menu-resume-${schedule.id}`}
      >
        Resume schedule
      </DropdownMenuItem>
    );
  } else {
    cadenceAction = (
      <DropdownMenuItem
        leading={pauseLeading}
        disabled={schedule.status === "completed" || !canRun}
        status={pending?.pause ? "pending" : "idle"}
        pendingLabel="Pausing..."
        onSelect={onPause}
        testID={`schedule-menu-pause-${schedule.id}`}
      >
        Pause schedule
      </DropdownMenuItem>
    );
  }

  return (
    <>
      {cadenceAction}
      <DropdownMenuItem
        leading={runLeading}
        disabled={!canRun}
        status={pending?.runNow ? "pending" : "idle"}
        pendingLabel="Starting..."
        onSelect={onRunNow}
        testID={`schedule-menu-run-${schedule.id}`}
      >
        Run now
      </DropdownMenuItem>
    </>
  );
}

function renderKebabTriggerIcon({ hovered }: { hovered?: boolean }): ReactElement {
  return (
    <ThemedKebab
      size={MENU_ICON_SIZE}
      uniProps={hovered ? foregroundColorMapping : mutedColorMapping}
    />
  );
}

function ScheduleKebabMenu({
  schedule,
  canRun,
  pending,
  onEdit,
  onPause,
  onResume,
  onRunNow,
  onDelete,
}: Pick<
  ScheduleRowProps,
  "schedule" | "pending" | "onEdit" | "onPause" | "onResume" | "onRunNow" | "onDelete"
> & {
  canRun: boolean;
}): ReactElement {
  const productName = scheduleProductName(schedule);
  const productNameLower = productName.toLowerCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        hitSlop={8}
        style={kebabTriggerStyle}
        accessibilityRole={isNative ? "button" : undefined}
        accessibilityLabel={`${productName} actions`}
        testID={`schedule-kebab-${schedule.id}`}
      >
        {renderKebabTriggerIcon}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={220}>
        <DropdownMenuItem
          leading={editLeading}
          onSelect={onEdit}
          testID={`schedule-menu-edit-${schedule.id}`}
        >
          Edit {productNameLower}
        </DropdownMenuItem>
        <ScheduleExecutionMenuItems
          schedule={schedule}
          canRun={canRun}
          pending={pending}
          onPause={onPause}
          onResume={onResume}
          onRunNow={onRunNow}
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          leading={deleteLeading}
          destructive
          status={pending?.delete ? "pending" : "idle"}
          pendingLabel="Deleting..."
          onSelect={onDelete}
          testID={`schedule-menu-delete-${schedule.id}`}
        >
          Delete {productNameLower}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function kebabTriggerStyle({
  hovered = false,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.kebabTrigger, hovered && styles.kebabTriggerHovered];
}

const styles = StyleSheet.create((theme) => ({
  providerIcon: {
    color: theme.colors.foregroundMuted,
  },
  rowContainer: {
    position: "relative",
  },
  row: {
    gap: theme.spacing[3],
  },
  rowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  rowPressed: {
    backgroundColor: theme.colors.surface3,
  },
  main: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[3],
  },
  leading: {
    width: PROVIDER_ICON_SIZE,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  textGroup: {
    flex: 1,
    minWidth: 0,
  },
  target: {
    marginTop: theme.spacing[1],
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  lastRunError: {
    marginTop: theme.spacing[1],
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.sm,
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  kebabTrigger: {
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.base,
  },
  kebabTriggerHovered: {
    backgroundColor: theme.colors.surface2,
  },
}));
