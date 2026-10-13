import * as Clipboard from "expo-clipboard";

export async function copyRichContent(input: { html: string; plain: string }): Promise<void> {
  try {
    await Clipboard.setStringAsync(input.html, { inputFormat: Clipboard.StringFormat.HTML });
  } catch {
    await Clipboard.setStringAsync(input.plain);
  }
}

export async function copyPlainContent(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}
