import os from "node:os";
import type { PluginHandlerContext, PluginServerContext } from "@getpaseo/plugin/server";
import {
  checkUpdates,
  inventory,
  skillDetail,
  type Inventory,
  type Skill,
} from "../shared/contracts";
import { findIssues, readSkillContent, scanSkills, skillRoots } from "./inventory";
import { checkSkillUpdates } from "./updates";
import { createUsage } from "./usage";

export function registerSkills(server: PluginServerContext) {
  const updates = new Map<string, Skill["update"]>();
  const updateKey = (skill: Skill) =>
    `${skill.id}:${skill.contentHash}:${skill.source.url}:${skill.source.revision}:${skill.source.filePath}`;
  const usage = createUsage(
    server,
    async (cwd) => (await scanSkills(skillRoots(os.homedir(), cwd))).skills,
  );
  async function readInventory(
    workspaceId: string | undefined,
    { paseo }: PluginHandlerContext,
  ): Promise<Inventory> {
    const projects: Inventory["projects"] = [];
    let cursor: string | undefined;
    do {
      const result = await paseo.workspaces.list({ page: { limit: 200, cursor } });
      projects.push(
        ...result.entries.map((workspace) => ({
          workspaceId: workspace.id,
          projectId: workspace.projectId,
          name: workspace.projectDisplayName,
          directory: workspace.workspaceDirectory ?? workspace.projectRootPath,
        })),
      );
      cursor = result.pageInfo.hasMore ? (result.pageInfo.nextCursor ?? undefined) : undefined;
    } while (cursor);
    const workspace = workspaceId
      ? projects.find((project) => project.workspaceId === workspaceId)
      : undefined;
    if (workspaceId && !workspace)
      throw new Error("Arbeitsbereich auf diesem Host nicht gefunden. Projektliste aktualisieren.");
    const { skills, warnings } = await scanSkills(skillRoots(os.homedir(), workspace?.directory));
    for (const skill of skills) skill.update = updates.get(updateKey(skill)) ?? skill.update;
    return {
      scannedAt: new Date().toISOString(),
      workspaceId: workspaceId ?? null,
      projects,
      skills,
      findings: findIssues(skills),
      warnings,
      observation: await usage.apply(skills),
    };
  }
  server.handle(inventory, ({ workspaceId }, context) => readInventory(workspaceId, context));
  server.handle(checkUpdates, async ({ workspaceId }, context) => {
    const result = await readInventory(workspaceId, context);
    await checkSkillUpdates(result.skills);
    for (const skill of result.skills) updates.set(updateKey(skill), skill.update);
    return result;
  });
  server.handle(skillDetail, async ({ id, workspaceId }, context) => {
    const result = await readInventory(workspaceId, context);
    const skill = result.skills.find((entry) => entry.id === id);
    if (!skill)
      throw new Error("Skill im ausgewählten Bereich nicht gefunden. Inventar aktualisieren.");
    const content =
      skill.realPath && skill.health === "ok"
        ? await readSkillContent(skill.realPath)
        : { content: null, truncated: false };
    return {
      skill,
      ...content,
      findings: result.findings.filter((finding) => finding.skillIds.includes(id)),
    };
  });
  return () => usage.close();
}
