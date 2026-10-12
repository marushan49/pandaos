import type { PluginClientContext } from "@getpaseo/plugin/client";
import { HostFooterItem } from "./client/footer";
import { HostScreen } from "./client/screen";

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "host", title: "Host", Component: HostScreen });
  client.addSidebarFooterItem({ id: "host", title: "Host", Component: HostFooterItem });
  return () => {};
}
