import type { PluginServerContext } from "@getpaseo/plugin/server";
import { decideContinue } from "./decide";
import { progressOf } from "./milestones";
import { previousSeen, recordRun, rememberSeen, RUN_CAP, runsLastHour } from "./runs";
import { readText, visionPaths } from "./store";

const TEXT_LIMIT = 2000;

function limited(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > TEXT_LIMIT ? `${trimmed.slice(0, TEXT_LIMIT)}\n[gekürzt]` : trimmed;
}

function briefing(input: {
  projectGoal: string;
  workspaceText: string;
  workspaceFile: string;
}): string {
  return [
    "## Projektziel",
    input.projectGoal.trim() ? limited(input.projectGoal) : "nicht gesetzt",
    "",
    "## Vision dieses Workspaces",
    input.workspaceText.trim() ? limited(input.workspaceText) : "nicht gesetzt",
    "",
    "## Arbeitsweise",
    "- Arbeite selbstständig auf Projektziel und Vision hin. Frage nicht nach, entscheide im Sinne dieser Vorgaben.",
    `- Lege Meilensteine selbst fest und halte sie als Checkliste (\`- [ ]\` offen, \`- [x]\` erledigt) in ${input.workspaceFile} fest. Lege die Datei an, falls sie fehlt.`,
    "- Hältst du bei einer nicht rückgängig zu machenden Aktion an (Push, Merge, Löschen, Deploy, Jira-Änderung), schreibe `BLOCKED: <Grund>` in diese Datei.",
  ].join("\n");
}

function followUp(workspaceFile: string): string {
  return `Arbeite am nächsten offenen Meilenstein in ${workspaceFile} weiter. Hake erledigte Punkte ab und ergänze neue Meilensteine, wenn nötig. Ist alles erledigt, prüfe das Ergebnis kurz und schreibe eine Abschlussnotiz in die Datei. Frage nicht nach. Nur bei einer nicht rückgängig zu machenden Aktion hältst du an und schreibst BLOCKED: <Grund> in die Datei.`;
}

export function registerVisionHooks(server: PluginServerContext): void {
  server.before("agent.create", async ({ request }) => {
    const paths = await visionPaths(request.config.cwd);
    const projectGoal = await readText(paths.projectFile);
    const workspaceText = await readText(paths.workspaceFile);
    if (!projectGoal.trim() && !workspaceText.trim()) return undefined;
    const block = briefing({ projectGoal, workspaceText, workspaceFile: paths.workspaceFile });
    return {
      ...request,
      config: {
        ...request.config,
        systemPrompt: [request.config.systemPrompt, block].filter(Boolean).join("\n\n"),
      },
    };
  });

  server.on("agent.turn_ended", async (event, context) => {
    const cwd = event.agent.cwd;
    if (!cwd) return;
    const paths = await visionPaths(cwd);
    const text = await readText(paths.workspaceFile);
    if (!text.trim()) return;
    const progress = progressOf(text);
    const now = Date.now();
    const decision = decideContinue({
      outcome: event.outcome.kind,
      progress,
      previous: previousSeen(paths.workspaceKey),
      runsLastHour: runsLastHour(paths.workspaceKey, now),
      runCap: RUN_CAP,
    });
    rememberSeen(paths.workspaceKey, progress);
    if (!decision.continueRun) {
      console.log(`[workspace-vision] stop ${event.agent.id}: ${decision.reason}`);
      return;
    }
    recordRun(paths.workspaceKey, now);
    console.log(`[workspace-vision] continue ${event.agent.id}: ${decision.reason}`);
    await context.paseo.agents.ref(event.agent.id).send(followUp(paths.workspaceFile));
  });
}
