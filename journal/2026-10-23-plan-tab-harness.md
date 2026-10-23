# 2026-10-23 Plan im Tasks-Tab aus dem Harness

## Ziel

Der Tasks-Tab zeigt bei jeder mehrstufigen Aufgabe den Plan des Agenten mit aktuellem Schritt, wie Claude Code. Die Anzeige bleibt im optionalen Tab (Entscheidung vom 22.10.); der Harness sorgt dafür, dass ein Plan entsteht.

## Befund

- Der Tab liest nur Timeline-`todo`-Einträge aus dem Planwerkzeug des Agenten. Prosa wie „Schritt 4 von 5“ erscheint dort nicht.
- Claude Code 2.1.296 blendet `TaskCreate`/`TaskUpdate` für Claude-5-Modelle aus, solange `CLAUDE_CODE_ENABLE_TODO_TOOLS` fehlt (Gate `o2()` im CLI-Bundle). Gemessen mit `claude -p --model claude-haiku-5-5`: ohne Variable nur `Task`, `TaskStop`; mit `=1` zusätzlich `TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate`.
- Codex 0.159.0 bietet `update_plan` nur mit `tools.update_plan.enabled`. Gemessen über `codex app-server` mit `thread/start.config`: mit Schalter ein `turn/plan/updated` (A inProgress, B/C pending), ohne Schalter keiner. `codex exec` ohne Schalter meldet „KEIN update_plan“.
- Die Kaggle-Session `aaadd6d` (Codex) hatte 0 `update_plan`-Aufrufe in 4589 Rollout-Zeilen.

## Änderung

- `writing-block-instruction.ts`: `PLAN_TRACKING_INSTRUCTION` im Daemon-Prompt für alle Provider.
- `providers/claude/agent.ts`: `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` im SDK-Env.
- `codex-app-server-agent.ts`: `tools.update_plan.enabled=true` in der Thread-Konfiguration für Start, Resume und Fork; ein ausdrücklicher Nutzerwert hat Vorrang.
- Doku: `docs/agent-lifecycle.md`, Abschnitt Workspace activity.

## Prüfung

- Format, Lint 0/0, Server-Typecheck, Server-Build (`build:lib`) grün.
- Tests: `codex-app-server-agent.test.ts`, `codex-async-questions.test.ts`, `claude/agent.env.test.ts` 193/193 (Queue #1430).
- `pandaos-planned-restart --dry-run --release …/plan-tab` bestanden (`.dev/plan-tab/restart-preview.log`, 8 Sessions würden gefragt).
- Commit `cece18661` auf main, gepusht nach `marushan49/pandaos`. Pre-Commit-Hook: Lint, Format, Monorepo-Typecheck grün.
- Kandidat `~/.local/share/pandaos-releases/plan-tab`: Hardlink-Kopie von `turn-id-reuse-fix`, 19 Dateien laut `.dev/plan-tab/files.txt`, Hashes und `node --check` bestanden. Der erste Kandidat auf Basis `quota-steer-fix-current` wurde verworfen, weil live inzwischen auf `turn-id-reuse-fix` stand.
- Geplanter Neustart `plan-tab-20261023` nach Freigabe („jap“): Daemon läuft auf `plan-tab`, Dienst aktiv, serverId `srv_RtppvtlARpFR` unverändert, 4 Sessions fortgesetzt, 2 meldeten `done`.

## Live-Abnahme

- Claude: Diese Session (`aa7d65b8`, Opus 5.5) hatte nach dem Neustart `TaskCreate`/`TaskUpdate`/`TaskList`/`TaskGet`. Der Tasks-Tab zeigte „1/4 tasks“, den aktiven Schritt hervorgehoben, zwei offene Schritte und „1 Completed“ eingeklappt; über dem Eingabefeld erschien der Chip „1/4 tasks“. Bild angesehen: Evidenz `evr_f3826027-6a99-4d00-86d5-1f9efec808a4`, Produktbrowser 1280×720, normale Schrift. Funktion und Sicht bestanden.
- `browser_test` `evr_476b3632` meldete PASS, obwohl der Tab noch nicht offen war: die Prüftexte standen auch im Chatverlauf. Maßgeblich ist der manuell übernommene Lauf; das dabei gespeicherte Rezept `plan-tab-claude-tasks` wurde wieder entfernt. Der Klick auf „Open Explorer sidebar“ war per Rolle/Name mehrdeutig (`evr_16caad3f`); geöffnet wurde über `workspace-new-tab-button` und `workspace-new-tab-menu-tasks`.
- Codex: Testsession `770629c8` (GPT-6.1 Sol, Modus auto) legte ohne Hinweis im Prompt einen Plan mit drei Schritten an. Der Tasks-Tab zeigte „1/3 tasks“, aktiv „Zeilen von AGENTS.md zählen“ mit Status „Needs input“, einen offenen Schritt und „1 Completed“. Bild angesehen: Evidenz `evr_e09731a3-5ddb-4abd-849d-cd86486ef500`, 1280×720. Funktion und Sicht bestanden. Die Testsession bleibt offen.
- Befund außerhalb dieser Änderung: Tab-Titel „Tasks“ und Kartenüberschrift „Tasks“ stehen doppelt. Die Codex-Sandbox scheitert auf dem Zotac an bwrap und fragt pro Befehl nach Freigabe.

## Status

Fertig. Keine Queue-Jobs, Heartbeats oder Hintergrundprozesse offen. Testordner `/tmp/plan-codex-check` und `/tmp/todo-gate-check` entfernt.
