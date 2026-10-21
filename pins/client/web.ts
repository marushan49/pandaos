import { Platform } from "react-native";

declare const window: {
  location: { pathname: string };
  addEventListener(type: string, listener: (event: { detail?: unknown }) => void): void;
  removeEventListener(type: string, listener: (event: { detail?: unknown }) => void): void;
};

export function onPinSelection(handler: (workspaceId: string, text: string) => void): () => void {
  if (Platform.OS !== "web" || typeof window === "undefined") return () => {};
  const listener = (event: { detail?: unknown }) => {
    const match = /\/workspace\/([^/?#]+)/.exec(window.location.pathname);
    if (match && typeof event.detail === "string")
      handler(decodeURIComponent(match[1]), event.detail);
  };
  window.addEventListener("paseo:pin-selection", listener);
  return () => window.removeEventListener("paseo:pin-selection", listener);
}
