import * as Clipboard from "expo-clipboard";

export async function copyRichContent(input: { html: string; plain: string }): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([input.html], { type: "text/html" }),
          "text/plain": new Blob([input.plain], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {}
  }
  await Clipboard.setStringAsync(input.plain);
}

export async function copyPlainContent(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}
