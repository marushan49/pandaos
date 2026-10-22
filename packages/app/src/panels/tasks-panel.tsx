import { ListChecks } from "@/components/icons/ui-icons";
import { withUnistyles } from "react-native-unistyles";
import { usePaneContext } from "@/panels/pane-context";
import { definePanel } from "@/panels/panel-registry";
import { WorkspaceTaskPlan } from "@/screens/workspace/workspace-task-plan";

const ThemedListChecks = withUnistyles(ListChecks);

function TasksPanel() {
  const { serverId, workspaceId } = usePaneContext();
  return <WorkspaceTaskPlan serverId={serverId} workspaceId={workspaceId} />;
}

export const tasksPanelRegistration = definePanel("tasks", {
  component: TasksPanel,
  presentation: {
    label: (t) => t("message.todo.title"),
    subtitle: (t) => t("message.todo.title"),
    tooltip: (t) => t("message.todo.title"),
    icon: ThemedListChecks,
  },
});
