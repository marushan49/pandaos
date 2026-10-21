import { useSettings, type PluginClientContext } from "@getpaseo/plugin/client";
import { useEffect } from "react";
import { createPinStore } from "./client/store";
import { onPinSelection } from "./client/web";
import { pinsSettings } from "./shared/pins";

export default function contribute(client: PluginClientContext) {
  const store = createPinStore(client);

  function PinsSync() {
    const settings = useSettings(pinsSettings);
    const revision = settings.status === "ready" ? settings.revision : null;
    useEffect(() => {
      if (settings.status === "ready") store.apply(settings.values);
    }, [revision]);
    return null;
  }

  client.addSidebarHeaderItem({ id: "pins-sync", title: "Pins", Component: PinsSync });

  client.addSlashCommand({
    name: "pin",
    description: "Text oder Link oben in diesem Workspace anpinnen",
    argumentHint: "<text oder link>",
    context: "workspace",
    onSubmit: ({ args, workspace }) => store.add(workspace.id, args),
  });

  const stopListening = onPinSelection((workspaceId, text) => {
    store
      .add(workspaceId, text)
      .catch((error) => console.error("[pins] Anpinnen fehlgeschlagen", error));
  });
  store.load().catch((error) => console.error("[pins] Laden fehlgeschlagen", error));

  return () => {
    stopListening();
    store.dispose();
  };
}
