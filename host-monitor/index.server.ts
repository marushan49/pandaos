import type { PluginServerContext } from "@getpaseo/plugin/server";
import { listHostAgents, requestTriage } from "./server/agents";
import { startMonitor } from "./server/monitor";
import { canCloseTabs, closeTab, listTabs } from "./server/tabs";
import { hostCloseTab, hostSnapshot, hostStop, hostTriage } from "./shared/host";

export default function contribute(server: PluginServerContext) {
  const monitor = startMonitor();
  server.handle(hostSnapshot, async (_input, context) => {
    const { footprints, stopTargets: _stopTargets, ...reading } = await monitor.snapshot();
    const [agents, tabs] = await Promise.all([
      listHostAgents(context.paseo, footprints),
      listTabs(context.paseo).catch(() => []),
    ]);
    return { ...reading, agents, tabs, tabsClosable: canCloseTabs(context.paseo) };
  });
  server.handle(hostTriage, async (input, context) => {
    const { footprints } = await monitor.snapshot();
    return requestTriage(context.paseo, input.agentId, footprints);
  });
  server.handle(hostStop, (input) => monitor.stopProcess(input.pid));
  server.handle(hostCloseTab, (input, context) => closeTab(context.paseo, input));
  return () => monitor.stop();
}
