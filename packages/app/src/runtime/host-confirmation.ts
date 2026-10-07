import type { ConnectionOffer } from "@getpaseo/protocol/connection-offer";
import { relayConnectionFromOffer, type HostProfile } from "@/types/host-connection";

export interface HostConfirmationRequest {
  id: number;
  serverId: string;
  keyFingerprint: string;
  relayEndpoint: string;
  kind: "newHost" | "changedConnection";
}

interface PendingConfirmation {
  request: HostConfirmationRequest;
  resolve: (approved: boolean) => void;
}

export class HostConfirmations {
  private pending: PendingConfirmation | null = null;
  private nextRequestId = 1;
  private listeners = new Set<() => void>();

  getPending(): HostConfirmationRequest | null {
    return this.pending?.request ?? null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  answer(requestId: number, approved: boolean): void {
    const current = this.pending;
    if (!current || current.request.id !== requestId) return;
    this.pending = null;
    this.emit();
    current.resolve(approved);
  }

  confirmLink(offer: ConnectionOffer, savedHosts: HostProfile[]): Promise<boolean> {
    const connection = relayConnectionFromOffer(offer);
    const savedHost = savedHosts.find((host) => host.serverId === offer.serverId);
    const matchesSavedConnection = savedHost?.connections.some(
      (saved) =>
        saved.type === "relay" &&
        saved.id === connection.id &&
        saved.relayEndpoint === connection.relayEndpoint &&
        saved.daemonPublicKeyB64 === connection.daemonPublicKeyB64 &&
        saved.useTls === connection.useTls,
    );
    if (matchesSavedConnection) return Promise.resolve(true);
    return this.ask({
      id: this.nextRequestId++,
      serverId: offer.serverId,
      keyFingerprint: formatDaemonKeyFingerprint(connection.daemonPublicKeyB64),
      relayEndpoint: connection.relayEndpoint,
      kind: savedHost ? "changedConnection" : "newHost",
    });
  }

  private ask(request: HostConfirmationRequest): Promise<boolean> {
    this.pending?.resolve(false);
    return new Promise<boolean>((resolve) => {
      this.pending = { request, resolve };
      this.emit();
    });
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function formatDaemonKeyFingerprint(daemonPublicKeyB64: string): string {
  const normalized = daemonPublicKeyB64.replace(/[^A-Za-z0-9]/g, "");
  const group = (value: string): string => value.replace(/(.{4})/g, "$1 ").trim();
  if (normalized.length <= 16) return group(normalized);
  return `${group(normalized.slice(0, 8))} … ${group(normalized.slice(-8))}`;
}
