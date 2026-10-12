import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { hostCloseTab, hostSnapshot, hostStop, hostTriage } from "../shared/host";

export function useHostSnapshot() {
  const snapshot = useRpc(hostSnapshot);
  return useQuery({
    queryKey: ["host-monitor", "snapshot"],
    queryFn: () => snapshot({}),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function useHostTriage() {
  return useRpc(hostTriage);
}

export function useHostStop() {
  return useRpc(hostStop);
}

export function useHostCloseTab() {
  return useRpc(hostCloseTab);
}
