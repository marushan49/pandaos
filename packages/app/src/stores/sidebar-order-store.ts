import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";
import type { SidebarOrderSyncMark } from "@/sidebar-order-sync/sync";

interface SidebarOrderStoreState {
  workspacePromotedAt: Record<string, number>;
  promoteWorkspace: (workspaceKey: string) => void;
  projectOrder: string[];
  pinnedWorkspaceOrder: string[];
  workspaceOrderByProject: Record<string, string[]>;
  getProjectOrder: () => string[];
  setProjectOrder: (keys: string[]) => void;
  getPinnedWorkspaceOrder: () => string[];
  setPinnedWorkspaceOrder: (keys: string[]) => void;
  getWorkspaceOrder: (projectViewKey: string) => string[];
  setWorkspaceOrder: (projectViewKey: string, keys: string[]) => void;
  syncMark: SidebarOrderSyncMark | null;
}

interface SidebarOrderPersistedState {
  workspacePromotedAt?: Record<string, number>;
  projectOrder?: string[];
  pinnedWorkspaceOrder?: string[];
  workspaceOrderByProject?: Record<string, string[]>;
  projectOrderByServerId?: Record<string, string[]>;
  workspaceOrderByServerAndProject?: Record<string, string[]>;
  syncMark?: SidebarOrderSyncMark | null;
}

const StringArrayRecordSchema = z.record(z.string(), z.array(z.string()));
const SidebarOrderPersistedStateSchema = z.strictObject({
  workspacePromotedAt: z.record(z.string(), z.number()).optional(),
  projectOrder: z.array(z.string()).optional(),
  pinnedWorkspaceOrder: z.array(z.string()).optional(),
  workspaceOrderByProject: StringArrayRecordSchema.optional(),
  projectOrderByServerId: StringArrayRecordSchema.optional(),
  workspaceOrderByServerAndProject: StringArrayRecordSchema.optional(),
  syncMark: z
    .object({ serverId: z.string(), revision: z.number().int(), fingerprint: z.string() })
    .nullable()
    .optional(),
});

interface SidebarWorkspaceOrderScope {
  serverId: string;
  projectViewKey: string;
}

function normalizeKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawKey of keys) {
    const key = rawKey.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(key);
  }

  return normalized;
}

function dedupeKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const key of keys) {
    if (!key.trim() || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(key);
  }

  return deduped;
}

function normalizeWorkspaceOrderByProject(
  workspaceOrderByProject: Record<string, string[]> | undefined,
): Record<string, string[]> {
  const normalized: Record<string, string[]> = {};
  for (const [projectViewKey, order] of Object.entries(workspaceOrderByProject ?? {})) {
    const scope = projectViewKey.trim();
    if (!scope) continue;
    normalized[scope] = normalizeKeys(order);
  }
  return normalized;
}

function extractWorkspaceOrderScope(scopeKey: string): SidebarWorkspaceOrderScope | null {
  const separatorIndex = scopeKey.indexOf("::");
  if (separatorIndex < 0) return null;
  const serverId = scopeKey.slice(0, separatorIndex).trim();
  const projectViewKey = scopeKey.slice(separatorIndex + 2).trim();
  if (!serverId || !projectViewKey) return null;
  return { serverId, projectViewKey };
}

function normalizeLegacyWorkspaceKey(serverId: string, rawWorkspaceKey: string): string | null {
  const workspaceKey = rawWorkspaceKey.trim();
  if (!workspaceKey) return null;
  const serverPrefix = `${serverId}:`;
  return workspaceKey.startsWith(serverPrefix) ? workspaceKey : `${serverPrefix}${workspaceKey}`;
}

export function migrateSidebarOrderState(persistedState: unknown): {
  projectOrder: string[];
  pinnedWorkspaceOrder: string[];
  workspaceOrderByProject: Record<string, string[]>;
} {
  const result = SidebarOrderPersistedStateSchema.safeParse(persistedState);
  if (!result.success) {
    return { projectOrder: [], pinnedWorkspaceOrder: [], workspaceOrderByProject: {} };
  }
  const state: SidebarOrderPersistedState = result.data;

  const projectOrder = normalizeKeys(state.projectOrder ?? []);
  const seenProjects = new Set(projectOrder);
  for (const keys of Object.values(state.projectOrderByServerId ?? {})) {
    for (const key of normalizeKeys(keys)) {
      if (seenProjects.has(key)) continue;
      seenProjects.add(key);
      projectOrder.push(key);
    }
  }

  const workspaceOrderByProject = normalizeWorkspaceOrderByProject(state.workspaceOrderByProject);
  for (const [scopeKey, order] of Object.entries(state.workspaceOrderByServerAndProject ?? {})) {
    const scope = extractWorkspaceOrderScope(scopeKey);
    if (!scope) continue;
    const existing = workspaceOrderByProject[scope.projectViewKey] ?? [];
    const merged = [...existing];
    const seen = new Set(merged);
    for (const key of order) {
      const workspaceKey = normalizeLegacyWorkspaceKey(scope.serverId, key);
      if (!workspaceKey || seen.has(workspaceKey)) continue;
      seen.add(workspaceKey);
      merged.push(workspaceKey);
    }
    workspaceOrderByProject[scope.projectViewKey] = merged;
  }

  return {
    projectOrder,
    pinnedWorkspaceOrder: normalizeKeys(state.pinnedWorkspaceOrder ?? []),
    workspaceOrderByProject,
  };
}

export const useSidebarOrderStore = create<SidebarOrderStoreState>()(
  persist(
    (set, get) => ({
      workspacePromotedAt: {},
      promoteWorkspace: (workspaceKey) => {
        if (!workspaceKey.trim()) return;
        set((state) => {
          const workspaceOrderByProject = { ...state.workspaceOrderByProject };
          const projectKeys: string[] = [];
          for (const [projectKey, order] of Object.entries(workspaceOrderByProject)) {
            if (!order.includes(workspaceKey)) continue;
            projectKeys.push(projectKey);
            workspaceOrderByProject[projectKey] = [
              workspaceKey,
              ...order.filter((key) => key !== workspaceKey),
            ];
          }
          return {
            workspacePromotedAt: { ...state.workspacePromotedAt, [workspaceKey]: Date.now() },
            workspaceOrderByProject,
            projectOrder: [
              ...projectKeys,
              ...state.projectOrder.filter((key) => !projectKeys.includes(key)),
            ],
            pinnedWorkspaceOrder: [
              workspaceKey,
              ...state.pinnedWorkspaceOrder.filter((key) => key !== workspaceKey),
            ],
          };
        });
      },
      projectOrder: [],
      pinnedWorkspaceOrder: [],
      workspaceOrderByProject: {},
      getProjectOrder: () => get().projectOrder,
      setProjectOrder: (keys) => {
        set({ projectOrder: dedupeKeys(keys) });
      },
      getPinnedWorkspaceOrder: () => get().pinnedWorkspaceOrder,
      setPinnedWorkspaceOrder: (keys) => {
        set({ pinnedWorkspaceOrder: dedupeKeys(keys) });
      },
      getWorkspaceOrder: (projectViewKey) => {
        if (!projectViewKey.trim()) return [];
        return get().workspaceOrderByProject[projectViewKey] ?? [];
      },
      setWorkspaceOrder: (projectViewKey, keys) => {
        if (!projectViewKey.trim()) return;
        set((state) => ({
          workspaceOrderByProject: {
            ...state.workspaceOrderByProject,
            [projectViewKey]: dedupeKeys(keys),
          },
        }));
      },
      syncMark: null,
    }),
    {
      name: "sidebar-project-workspace-order",
      storage: createValidatedPersistStorage(AsyncStorage, SidebarOrderPersistedStateSchema),
      partialize: (state) => ({
        workspacePromotedAt: state.workspacePromotedAt,
        projectOrder: state.projectOrder,
        pinnedWorkspaceOrder: state.pinnedWorkspaceOrder,
        workspaceOrderByProject: state.workspaceOrderByProject,
        syncMark: state.syncMark,
      }),
      version: 1,
      migrate: migrateSidebarOrderState,
    },
  ),
);
