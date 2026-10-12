import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useWorkspace, type PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { MediaScreen } from "./screen.js";
import { selectedMedia, subscribeMedia } from "./selection.js";

export function MediaPanel(props: PluginWorkspacePanelProps) {
  const directory = useWorkspace(props.workspaceId, (workspace) => workspace.directory) || "~";
  const snapshot = useCallback(() => selectedMedia(props.workspaceId), [props.workspaceId]);
  const selection = useSyncExternalStore(subscribeMedia, snapshot, snapshot);
  const params = useMemo(
    () => ({ path: selection.path, revision: String(selection.revision), directory }),
    [selection, directory],
  );
  return <MediaScreen {...props} params={params} />;
}
