import type { PluginClientContext } from "@getpaseo/plugin/client";
import { DemoScreen, SurfaceTimeline } from "./client/surface";
import { timelineDataSchema, transformAssistant, transformTool } from "./client/transform";

export default function contribute(client: PluginClientContext) {
  client.addTimelineTransformer({
    id: "ui-message",
    query: { itemType: "assistant_message" },
    transform: transformAssistant,
  });
  client.addTimelineTransformer({
    id: "ui-tool",
    query: { itemType: "tool_call" },
    transform: transformTool,
  });
  client.addTimelineRenderer({
    kind: "interactive-surface",
    version: 1,
    schema: timelineDataSchema,
    Component: SurfaceTimeline,
  });
  client.addScreen({ id: "demo", title: "Cost simulator", Component: DemoScreen });
  client.addCommandCenterItem({
    id: "demo",
    title: "Open cost simulator",
    icon: "Calculator",
    context: "global",
    onSelect: (context) => context.openScreen({ screenId: "demo" }),
  });
  return () => {};
}
