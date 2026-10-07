import type { PaseoApi } from "@getpaseo/client";
import type { QueryClient } from "@tanstack/react-query";
import type { PluginRequirements } from "@getpaseo/protocol/messages";
import type {
  PluginAttachmentSourceContribution,
  PluginCleanup,
  PluginThemeContribution,
} from "@getpaseo/plugin";
import type {
  PluginSubmissionCheckContribution,
  PluginExecutionModeContribution,
  PluginCommandCenterItemContribution,
  PluginClientSlashCommandContribution,
  PluginComposerPillContribution,
  PluginSidebarContribution,
  PluginSidebarItemContribution,
  PluginScreenContribution,
  PluginSettingsScreenContribution,
  PluginTimelineRendererContribution,
  PluginTimelineTransformerContribution,
  PluginPanelLocation,
  PluginWorkspacePanelContribution,
} from "@getpaseo/plugin/client";

export type PluginSidebarSection = "header" | "footer";

export type EvaluatedPluginWorkspacePanelContribution = PluginWorkspacePanelContribution & {
  locations: readonly PluginPanelLocation[];
};

export interface EvaluatedPlugin {
  id: string;
  cleanup: PluginCleanup;
  submissionChecks?: PluginSubmissionCheckContribution[];
  executionModes: PluginExecutionModeContribution[];
  surfaces: PluginScreenContribution[];
  settingsScreens: PluginSettingsScreenContribution[];
  sidebarItems: Record<PluginSidebarSection, PluginSidebarItemContribution[]>;
  // COMPAT(pluginSidebarAliases): added in v0.11.0, remove after 2027-03-29

  legacySidebarItems: PluginSidebarContribution[];
  workspacePanels: EvaluatedPluginWorkspacePanelContribution[];
  commandCenterItems: PluginCommandCenterItemContribution[];
  clientSlashCommands: PluginClientSlashCommandContribution[];
  attachmentSources: PluginAttachmentSourceContribution[];
  themes: PluginThemeContribution[];
  timelineTransformers: PluginTimelineTransformerContribution[];
  timelineRenderers: PluginTimelineRendererContribution[];
}

export interface InstalledPlugin extends EvaluatedPlugin {
  lifetime: AbortController;

  paseo: PaseoApi;

  invoke(method: string, input: unknown): Promise<unknown>;
  serverId: string;
  requirements?: PluginRequirements;
  clientBundle: string;
  queryClient: QueryClient;
}

export type {
  PluginAttachmentSourceContribution,
  PluginCommandCenterItemContribution,
  PluginClientSlashCommandContribution,
  PluginComposerPillContribution,
  PluginSidebarContribution,
  PluginSidebarItemContribution,
  PluginScreenContribution,
  PluginSettingsScreenContribution,
  PluginThemeContribution,
  PluginTimelineRendererContribution,
  PluginTimelineTransformerContribution,
  PluginWorkspacePanelContribution,
};
