import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import {
  checkUpdates,
  inventory,
  type Finding,
  type Inventory,
  type Skill,
} from "../shared/contracts.ts";
import { listPlugins, type DeckPlugin } from "../shared/plugins.ts";
import {
  DeckFilters,
  DeckFooter,
  DeckHeader,
  DeckInfo,
  DeckPane,
  InventoryStatus,
} from "./panels.tsx";
import { useDeckStyles } from "./ui.tsx";

export type Tab = "skills" | "plugins" | "findings" | "usage";
const emptySkills: Skill[] = [];
const emptyFindings: Finding[] = [];
const emptyProjects: Inventory["projects"] = [];
const emptyPlugins: DeckPlugin[] = [];

function useDeckQueries(hostId: string, workspaceId: string, tab: Tab) {
  const read = useRpc(inventory);
  const check = useRpc(checkUpdates);
  const readPlugins = useRpc(listPlugins);
  const queryClient = useQueryClient();
  const input = { workspaceId: workspaceId || undefined };
  const queryKey = ["skill-deck", hostId, workspaceId || "global", "inventory"];
  const pluginKey = ["skill-deck", hostId, "plugins"];
  const query = useQuery({ queryKey, queryFn: () => read(input), retry: false, staleTime: 30_000 });
  const plugins = useQuery({
    queryKey: pluginKey,
    queryFn: () => readPlugins({ checkUpdates: false }),
    enabled: tab === "plugins",
    retry: false,
    staleTime: 30_000,
  });
  const updates = useMutation({
    mutationFn: () => check(input),
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
  });
  const pluginUpdates = useMutation({
    mutationFn: () => readPlugins({ checkUpdates: true }),
    onSuccess: (data) => queryClient.setQueryData(pluginKey, data),
  });
  const { refetch: refetchInventory } = query;
  const { refetch: refetchPlugins } = plugins;
  const { mutate: updateSkills } = updates;
  const { mutate: updatePlugins } = pluginUpdates;
  const reloadInventory = useCallback(() => {
    void refetchInventory();
  }, [refetchInventory]);
  const reloadPlugins = useCallback(() => {
    void refetchPlugins();
  }, [refetchPlugins]);
  const refresh = useCallback(() => {
    if (tab === "plugins") void refetchPlugins();
    else void refetchInventory();
  }, [tab, refetchInventory, refetchPlugins]);
  const runUpdates = useCallback(() => {
    if (tab === "plugins") updatePlugins();
    else updateSkills();
  }, [tab, updatePlugins, updateSkills]);
  return {
    query,
    plugins,
    reloadInventory,
    reloadPlugins,
    refresh,
    runUpdates,
    busy: tab === "plugins" ? pluginUpdates.isPending : updates.isPending,
    updateError: tab === "plugins" ? pluginUpdates.error : updates.error,
  };
}

export function useDeckModel({ host, layout, theme }: PluginScreenProps) {
  const [width, setWidth] = useState(layout.compact ? 400 : 1200);
  const compact = layout.compact || width < 820;
  const styles = useDeckStyles(theme, compact);
  const [tab, setTab] = useState<Tab>("skills");
  const [search, setSearch] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [provider, setProvider] = useState("");
  const [scope, setScope] = useState("all");
  const [updateFilter, setUpdateFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState(false);
  const [info, setInfo] = useState(false);
  const queries = useDeckQueries(host.id, workspaceId, tab);
  const data = queries.query.data;
  const allSkills = data?.skills ?? emptySkills;
  const allFindings = data?.findings ?? emptyFindings;
  const allProjects = data?.projects ?? emptyProjects;
  const allPlugins = queries.plugins.data?.plugins ?? emptyPlugins;
  const term = search.trim().toLocaleLowerCase();
  const skills = useMemo(
    () =>
      allSkills.filter(
        (skill) =>
          (!provider || skill.providers.includes(provider)) &&
          (scope === "all" || skill.scopes.some((value) => value === scope)) &&
          (updateFilter === "all" || skill.update.status === updateFilter) &&
          (!term ||
            [skill.name, skill.description, ...skill.providers].some((value) =>
              value.toLocaleLowerCase().includes(term),
            )),
      ),
    [allSkills, provider, scope, updateFilter, term],
  );
  const selected =
    skills.find((skill) => skill.id === selectedId) ?? (compact ? undefined : skills[0]);
  const findings = useMemo(
    () =>
      allFindings.filter(
        (finding) =>
          !term ||
          [finding.title, ...finding.evidence].some((value) =>
            value.toLocaleLowerCase().includes(term),
          ),
      ),
    [allFindings, term],
  );
  const visiblePlugins = useMemo(
    () =>
      allPlugins.filter(
        (plugin) =>
          !term || `${plugin.name} ${plugin.description}`.toLocaleLowerCase().includes(term),
      ),
    [allPlugins, term],
  );
  const usage = useMemo(
    () =>
      skills
        .flatMap((skill) => skill.usage.map((entry) => ({ ...entry, skill })))
        .sort((a, b) => b.count - a.count),
    [skills],
  );
  const maxCount = Math.max(1, ...usage.map((entry) => entry.count));
  const projectName = allProjects.find((project) => project.workspaceId === workspaceId)?.name;
  const providers = useMemo(
    () => [...new Set(allSkills.flatMap((skill) => skill.providers))].sort(),
    [allSkills],
  );
  const projectOptions = useMemo(() => {
    const projects = new Map(
      [...allProjects]
        .sort((a, b) => a.workspaceId.localeCompare(b.workspaceId))
        .map((project) => [project.directory, project]),
    );
    return [
      { value: "", label: "Nur globale Skills" },
      ...Array.from(projects.values(), (project) => ({
        value: project.workspaceId,
        label: `${project.name} (${project.directory})`,
      })),
    ];
  }, [allProjects]);
  const providerOptions = useMemo(
    () => [
      { value: "", label: "Alle Providerpfade" },
      ...providers.map((value) => ({ value, label: value })),
    ],
    [providers],
  );
  const openSkill = useCallback((id: string) => {
    setSearch("");
    setProvider("");
    setScope("all");
    setUpdateFilter("all");
    setTab("skills");
    setSelectedId(id);
  }, []);
  const changeWorkspace = useCallback((value: string) => {
    setWorkspaceId(value);
    setSelectedId(null);
    setScope("all");
  }, []);
  const openInfo = useCallback(() => setInfo(true), []);
  const closeInfo = useCallback(() => setInfo(false), []);
  const openFilters = useCallback(() => setFilters(true), []);
  const closeFilters = useCallback(() => setFilters(false), []);
  const back = useCallback(() => setSelectedId(null), []);
  const measure = useCallback(
    (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width),
    [],
  );
  const changeTab = useCallback((value: Tab) => {
    setTab(value);
    setSearch("");
  }, []);
  return {
    ...queries,
    host,
    theme,
    compact,
    styles,
    tab,
    search,
    setSearch,
    workspaceId,
    provider,
    setProvider,
    scope,
    setScope,
    updateFilter,
    setUpdateFilter,
    selected,
    setSelectedId,
    filters,
    setFilters,
    info,
    setInfo,
    data,
    skills,
    findings,
    visiblePlugins,
    usage,
    maxCount,
    projectName,
    projectOptions,
    providerOptions,
    openSkill,
    changeWorkspace,
    openInfo,
    closeInfo,
    openFilters,
    closeFilters,
    back,
    measure,
    changeTab,
  };
}

export type DeckModel = ReturnType<typeof useDeckModel>;

export function Deck(props: PluginScreenProps) {
  return <DeckHost key={props.host.id} {...props} />;
}

function DeckHost(props: PluginScreenProps) {
  const model = useDeckModel(props);
  return (
    <View style={model.styles.root} onLayout={model.measure}>
      <View style={model.styles.page}>
        <DeckHeader model={model} />
        <InventoryStatus model={model} />
        <DeckPane model={model} />
        <DeckFooter model={model} />
      </View>
      <DeckFilters model={model} />
      <DeckInfo model={model} />
    </View>
  );
}
