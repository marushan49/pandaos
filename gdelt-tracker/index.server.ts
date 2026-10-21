import type { PluginServerContext } from "@getpaseo/plugin/server";
import { answer, readPositions } from "./server/assess.ts";
import { createGdeltQueue } from "./server/gdelt.ts";
import { createPoller } from "./server/poller.ts";
import { createStores } from "./server/store.ts";
import { sendTelegram } from "./server/telegram.ts";
import {
  askAlert,
  pollNow,
  readScreenshot,
  readState,
  removeEntry,
  saveConfig,
  saveEntries,
  saveEntry,
  testTelegram,
} from "./shared/contracts.ts";

export default function contribute(server: PluginServerContext) {
  if (!server.dataDirectory)
    throw new Error("Bitte PandaOS-Host aktualisieren: Plugin-Datenverzeichnis fehlt.");
  const stores = createStores(server.dataDirectory);
  const generate = server.generate?.bind(server);
  const requireModel = () => {
    if (!generate) throw new Error("Bitte PandaOS-Host aktualisieren: Modellaufrufe fehlen.");
    return generate;
  };
  const poller = createPoller({ stores, gdelt: createGdeltQueue(), generate });

  async function configStatus() {
    const config = await stores.config.read();
    return {
      finnhub: Boolean(config.finnhubKey),
      telegram: Boolean(config.telegramToken && config.telegramChatId),
      model: Boolean(generate),
    };
  }

  server.handle(readState, async () => {
    const [watchlist, feed, config] = await Promise.all([
      stores.watchlist.read(),
      stores.feed.read(),
      configStatus(),
    ]);
    return {
      watchlist,
      alerts: feed.alerts,
      quotes: feed.quotes,
      status: feed.status,
      polledAt: feed.polledAt,
      config,
    };
  });
  server.handle(saveEntry, ({ revision, entry, id }) => stores.saveEntry(revision, entry, id));
  server.handle(saveEntries, ({ revision, entries }) => stores.saveEntries(revision, entries));
  server.handle(removeEntry, ({ revision, id }) => stores.removeEntry(revision, id));
  server.handle(readScreenshot, ({ images }) => readPositions(requireModel(), images));
  server.handle(askAlert, async ({ id, question }) => {
    const [feed, { entries }] = await Promise.all([stores.feed.read(), stores.watchlist.read()]);
    const alert = feed.alerts.find((item) => item.id === id);
    if (!alert) throw new Error("Meldung nicht mehr im Feed.");
    const related = feed.alerts
      .filter((item) => item.entryId === alert.entryId && item.id !== alert.id)
      .slice(0, 8);
    const text = await answer(requireModel(), {
      alert,
      entry: entries.find((entry) => entry.id === alert.entryId),
      related,
      question,
    });
    const at = new Date().toISOString();
    const next = await stores.feed.update((current) => ({
      ...current,
      alerts: current.alerts.map((item) =>
        item.id === id
          ? {
              ...item,
              chat: [
                ...item.chat,
                { role: "user" as const, text: question, at },
                { role: "assistant" as const, text, at },
              ],
            }
          : item,
      ),
    }));
    const updated = next.alerts.find((item) => item.id === id);
    if (!updated) throw new Error("Meldung nicht mehr im Feed.");
    return updated;
  });
  server.handle(saveConfig, async (input) => {
    await stores.config.update((current) => ({
      finnhubKey: input.finnhubKey ?? current.finnhubKey,
      telegramToken: input.telegramToken ?? current.telegramToken,
      telegramChatId: input.telegramChatId ?? current.telegramChatId,
    }));
    return configStatus();
  });
  server.handle(testTelegram, async () => {
    const config = await stores.config.read();
    if (!config.telegramToken || !config.telegramChatId)
      throw new Error("Bitte zuerst Bot-Token und Chat-ID speichern.");
    await sendTelegram(
      config.telegramToken,
      config.telegramChatId,
      "Aktien-Alerts aus PandaOS sind verbunden.",
    );
    return { ok: true as const };
  });
  server.handle(pollNow, () => ({ started: poller.run(true) }));

  const first = setTimeout(() => poller.run(), 10_000);
  const timer = setInterval(() => poller.run(), 60_000);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
