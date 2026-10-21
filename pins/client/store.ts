import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { createPinsPopover } from "./popover";
import { makePin, pinsDocumentSchema, pinsRpc, type Pin, type PinsDocument } from "../shared/pins";

function shorten(text: string, max: number) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function createPinStore(client: PluginClientContext) {
  const buttons = new Map<string, PluginButtonRegistration>();
  let pins: Pin[] = [];

  const Content = createPinsPopover((id) => remove(id));

  function render() {
    const byWorkspace = new Map<string, Pin[]>();
    for (const pin of pins)
      byWorkspace.set(pin.workspaceId, [...(byWorkspace.get(pin.workspaceId) ?? []), pin]);
    for (const [workspaceId, button] of buttons) {
      if (!byWorkspace.has(workspaceId)) {
        button.remove();
        buttons.delete(workspaceId);
      }
    }
    for (const [workspaceId, workspacePins] of byWorkspace) {
      const latest = workspacePins[0];
      const more = workspacePins.length > 1 ? ` +${workspacePins.length - 1}` : "";
      const descriptor = {
        title: `Angepinnt: ${shorten(latest.text, 120)}`,
        icon: "Pin",
        label: `${shorten(latest.text, 120)}${more}`,
        behavior: { kind: "popover" as const, Content },
      };
      const existing = buttons.get(workspaceId);
      if (existing) existing.update({ title: descriptor.title, label: descriptor.label });
      else
        buttons.set(
          workspaceId,
          client.addHeaderButton({ id: "pins", workspaceId, button: descriptor }),
        );
    }
  }

  function apply(document: PinsDocument) {
    pins = document.pins;
    render();
  }

  async function mutate(change: (current: Pin[]) => Pin[]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const read = await client.rpc(pinsRpc.read, {});
      if (read.status !== "ready") throw new Error(read.error);
      const current = pinsDocumentSchema.parse(read.values);
      const result = await client.rpc(pinsRpc.write, {
        revision: read.revision,
        values: { ...current, pins: change(current.pins) },
      });
      if (result.status === "saved") return apply(pinsDocumentSchema.parse(result.values));
      if (result.status === "invalid") throw new Error(result.error);
    }
    throw new Error("Pins wurden parallel geändert, bitte erneut versuchen.");
  }

  function add(workspaceId: string, text: string) {
    const pin = makePin(workspaceId, text);
    return pin ? mutate((current) => [pin, ...current]) : Promise.resolve();
  }

  function remove(id: string) {
    return mutate((current) => current.filter((pin) => pin.id !== id));
  }

  async function load() {
    const read = await client.rpc(pinsRpc.read, {});
    if (read.status === "ready") apply(pinsDocumentSchema.parse(read.values));
  }

  function dispose() {
    for (const button of buttons.values()) button.remove();
    buttons.clear();
  }

  return { add, apply, load, dispose };
}
