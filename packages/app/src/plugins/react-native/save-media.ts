import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { SaveMediaInput } from "@getpaseo/plugin/client/react-native";

export async function saveMedia({
  base64,
  mimeType,
  fileName,
}: SaveMediaInput): Promise<"downloaded" | "dialog"> {
  if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync()))
    throw new Error("Saving media is unavailable on this device.");
  const directory = `${FileSystem.cacheDirectory}pandaos-save-${Date.now()}-${Math.random().toString(36).slice(2)}/`;
  const uri = directory + encodeURIComponent(fileName.replace(/[\\/]/g, "_") || "media");
  const entries = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
  for (const entry of entries) {
    const match = /^pandaos-save-(\d+)-/.exec(entry);
    if (match && Number(match[1]) < Date.now() - 24 * 60 * 60 * 1000) {
      await FileSystem.deleteAsync(FileSystem.cacheDirectory + entry, { idempotent: true }).catch(
        () => undefined,
      );
    }
  }
  await FileSystem.makeDirectoryAsync(directory);
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: "Save or share media" });
  return "dialog";
}
