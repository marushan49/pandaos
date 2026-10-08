import type { PluginClientContext } from "@getpaseo/plugin/client";
import { BtwPanel } from "./client/panel";
import { askSideQuestion } from "./client/side-agent";

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: "btw",
    title: "BTW",
    icon: "MessageCircle",
    context: "agent",
    locations: ["explorer"],
    Component: BtwPanel,
  });
  client.addSlashCommand({
    name: "btw",
    description: "Ask a side question without interrupting this session",
    argumentHint: "<question>",
    context: "agent",
    async onSubmit({ args, agent, paseo, openPanel }) {
      openPanel("btw", { location: "explorer" });
      if (args) await askSideQuestion(paseo, agent, args);
    },
  });
  return () => {};
}
