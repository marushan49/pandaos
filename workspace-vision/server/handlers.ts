import { progressOf } from "./milestones";
import { runsLastHour } from "./runs";
import { readText, visionPaths, writeText } from "./store";

export async function getVision(input: { cwd: string }) {
  const paths = await visionPaths(input.cwd);
  const workspaceText = await readText(paths.workspaceFile);
  const progress = progressOf(workspaceText);
  return {
    projectGoal: await readText(paths.projectFile),
    workspaceText,
    workspaceFilePath: paths.workspaceFile,
    progress: {
      open: progress.open,
      done: progress.done,
      blocked: progress.blocked,
      runsLastHour: runsLastHour(paths.workspaceKey, Date.now()),
    },
  };
}

export async function saveVision(input: {
  cwd: string;
  projectGoal: string;
  workspaceText: string;
}) {
  const paths = await visionPaths(input.cwd);
  await writeText(paths.projectFile, input.projectGoal);
  await writeText(paths.workspaceFile, input.workspaceText);
  return { saved: true as const };
}
