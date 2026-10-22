import { useCallback, useMemo } from "react";
import type { GestureResponderEvent } from "react-native";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { ChevronDown, ChevronRight } from "@/components/icons/ui-icons";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";

export function SidebarSessionsToggle({ workspaceKey }: { workspaceKey: string }) {
  const { t } = useTranslation();
  const collapsed = useSidebarCollapsedSectionsStore((state) =>
    state.collapsedSessionWorkspaceKeys.has(workspaceKey),
  );
  const toggle = useSidebarCollapsedSectionsStore(
    (state) => state.toggleWorkspaceSessionsCollapsed,
  );
  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      toggle(workspaceKey);
    },
    [toggle, workspaceKey],
  );
  const label = t(collapsed ? "sidebar.sessions.expand" : "sidebar.sessions.collapse");
  const accessibilityState = useMemo(() => ({ expanded: !collapsed }), [collapsed]);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          leftIcon={collapsed ? ChevronRight : ChevronDown}
          onPress={handlePress}
          accessibilityLabel={label}
          accessibilityState={accessibilityState}
          aria-expanded={!collapsed}
          testID={`sidebar-sessions-toggle-${workspaceKey}`}
          style={styles.toggle}
          hitSlop={9}
        />
      </TooltipTrigger>
      <TooltipContent>
        <Text style={styles.tooltipText}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

const styles = StyleSheet.create((theme) => ({
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  toggle: {
    width: 26,
    height: 26,
    minHeight: 26,
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginVertical: -3,
    flexShrink: 0,
  },
}));
