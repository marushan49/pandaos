import type { PluginServerContext } from "@getpaseo/plugin/server";
import { SurfaceStore } from "./server/store";
import { readState, saveState } from "./shared/state";

export default function contribute(server: PluginServerContext) {
  if (!server.dataDirectory)
    throw new Error("This prototype requires a host with isolated plugin data storage.");
  const store = new SurfaceStore(server.dataDirectory);
  server.handle(readState, (key) => store.read(key));
  server.handle(saveState, ({ values, expectedRevision, ...key }) =>
    store.save(key, values, expectedRevision),
  );
  return () => {};
}
