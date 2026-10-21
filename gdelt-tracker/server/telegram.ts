import { timeoutSignal } from "./gdelt.ts";
import type { Alert, Entry } from "../shared/model.ts";
import { directionLabels, strengthLabels, pricedLabels } from "../shared/model.ts";

export async function sendTelegram(token: string, chatId: string, text: string) {
  if (!/^\d+:[\w-]+$/.test(token)) throw new Error("Telegram-Token hat ein ungültiges Format.");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    signal: timeoutSignal(15_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const description =
      typeof detail === "object" && detail && "description" in detail
        ? String(detail.description)
        : `HTTP ${response.status}`;
    throw new Error(`Telegram lehnt ab: ${description}`);
  }
}

export function alertText(alert: Alert, entry: Entry | undefined) {
  const mark = { positive: "▲", negative: "▼", neutral: "■" }[alert.direction];
  return [
    `${mark} ${entry?.name ?? "Position"}: ${directionLabels[alert.direction]}, Stärke ${strengthLabels[alert.strength]}`,
    alert.summary,
    alert.reasoning,
    `Eingepreist: ${pricedLabels[alert.priced]}`,
    `${alert.domain}: ${alert.url}`,
  ].join("\n");
}
