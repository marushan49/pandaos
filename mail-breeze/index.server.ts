import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  beginLogin,
  clearDemo,
  connectGmail,
  disconnect,
  dismissTask,
  getState,
  importMail,
  loadDemo,
  savePreferences,
  startTask,
  syncMail,
} from "./shared/contracts";
import { BreezeService } from "./server/service";
import { OutlookConnection } from "./server/outlook";
import { GmailConnection } from "./server/gmail";

export default function contribute(server: PluginServerContext) {
  if (!server.dataDirectory)
    throw new Error(
      "Bitte den PandaOS-Host aktualisieren: Mail Breeze benötigt eigenen dauerhaften Plugin-Speicher.",
    );
  const service = new BreezeService(server.dataDirectory);
  const outlook = new OutlookConnection(service);
  const gmail = new GmailConnection(service);
  let connecting = false;

  async function beginConnection<T>(action: () => Promise<T>): Promise<T> {
    if (connecting) throw new Error("Eine Postfach-Verbindung wird bereits eingerichtet.");
    connecting = true;
    try {
      await gmail.initialized;
      const { connection } = await service.get();
      if (
        connection.status === "connected" ||
        connection.status === "connecting" ||
        connection.account
      )
        throw new Error(
          "Trenne zuerst das aktive Postfach, bevor du einen anderen Zugang verbindest.",
        );
      return await action();
    } finally {
      connecting = false;
    }
  }

  async function sync(required = false) {
    await gmail.initialized;
    const { connection } = await service.get();
    if (connection.provider === "gmail") await gmail.sync(required);
    else await outlook.sync(required);
  }

  server.handle(getState, async (_, { paseo }) => {
    service.bind(paseo);
    await gmail.initialized;
    return service.get();
  });
  server.handle(savePreferences, (input, { paseo }) => {
    service.bind(paseo);
    return service.savePreferences(input);
  });
  server.handle(importMail, (input, { paseo }) => {
    service.bind(paseo);
    return service.import({ ...input, source: "manual" });
  });
  server.handle(loadDemo, () => service.demo());
  server.handle(clearDemo, () => service.clearDemo());
  server.handle(startTask, ({ taskId }, { paseo }) => {
    service.bind(paseo);
    return service.start(taskId);
  });
  server.handle(dismissTask, ({ taskId }) => service.dismiss(taskId));
  server.handle(syncMail, async (_, { paseo }) => {
    service.bind(paseo);
    await sync(true);
    return service.get();
  });
  server.handle(beginLogin, (_, { paseo }) => {
    service.bind(paseo);
    return beginConnection(() => outlook.begin());
  });
  server.handle(connectGmail, (input, { paseo }) => {
    service.bind(paseo);
    return beginConnection(() => gmail.connect(input));
  });
  server.handle(disconnect, async () => {
    await gmail.initialized;
    const { connection } = await service.get();
    return connection.provider === "gmail" ? gmail.disconnect() : outlook.disconnect();
  });

  server.on("agent.turn_started", async (event, { paseo }) => {
    service.bind(paseo);
    await service.started(event.agent.id);
  });
  server.on("agent.permission_requested", async (event, { paseo }) => {
    service.bind(paseo);
    await service.permission(event.agent.id);
  });
  server.on("agent.turn_ended", async (event, { paseo }) => {
    service.bind(paseo);
    await service.finish(event.agent.id, event.outcome, event.timeline);
    await service.next();
  });
  server.on("agent.closed", async (event, { paseo }) => {
    service.bind(paseo);
    await service.finish(event.agent.id, { kind: "canceled" }, []);
    await service.next();
  });
  server.on("agent.archived", async (event, { paseo }) => {
    service.bind(paseo);
    await service.finish(event.agent.id, { kind: "canceled" }, []);
    await service.next();
  });

  const timer = setInterval(() => {
    void sync()
      .then(() => service.next())
      .catch((error) =>
        console.error(
          "Mail Breeze:",
          error instanceof Error ? error.message : "Synchronisierung fehlgeschlagen",
        ),
      );
  }, 60000);
  timer.unref();

  return () => {
    clearInterval(timer);
    outlook.dispose();
    gmail.dispose();
  };
}
