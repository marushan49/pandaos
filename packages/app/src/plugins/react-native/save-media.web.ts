import { Buffer } from "buffer";
import type { SaveMediaInput } from "@getpaseo/plugin/client/react-native";

export async function saveMedia({
  base64,
  mimeType,
  fileName,
}: SaveMediaInput): Promise<"downloaded" | "dialog"> {
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.replace(/[\\/]/g, "_");
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return "downloaded";
}
