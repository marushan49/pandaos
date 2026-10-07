import { type ReactNode, useCallback } from "react";
import { Import, Plus } from "@/components/icons/ui-icons";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";

function SidebarEmptyStateCard({
  testID,
  title,
  description,
  children,
}: {
  testID: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

export function SidebarFilterEmptyState() {
  const { t } = useTranslation();
  const clearLabelFilter = useSidebarViewStore((state) => state.clearLabelFilter);
  const clearProjectFilters = useSidebarViewStore((state) => state.clearProjectFilters);
  const clearFilters = useCallback(() => {
    clearLabelFilter();
    clearProjectFilters();
  }, [clearLabelFilter, clearProjectFilters]);

  return (
    <SidebarEmptyStateCard
      testID="sidebar-filter-empty-state"
      title={t("sidebar.filterEmpty.title")}
      description={t("sidebar.filterEmpty.description")}
    >
      <Button variant="secondary" size="xs" onPress={clearFilters}>
        {t("sidebar.filterEmpty.clear")}
      </Button>
    </SidebarEmptyStateCard>
  );
}

export function SidebarProjectEmptyState({
  onAddProject,
  onImportSession,
}: {
  onAddProject?: () => void;
  onImportSession?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <SidebarEmptyStateCard
      testID="sidebar-project-empty-state"
      title={t("sidebar.project.empty.title")}
      description={t("sidebar.project.empty.description")}
    >
      <Button variant="secondary" size="xs" leftIcon={Plus} onPress={onAddProject}>
        {t("sidebar.actions.addProject")}
      </Button>
      <Button variant="outline" size="xs" leftIcon={Import} onPress={onImportSession}>
        {t("importSession.title")}
      </Button>
    </SidebarEmptyStateCard>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    marginTop: theme.spacing[3],
    padding: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
  },
  copy: {
    gap: theme.spacing[1],
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  description: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
