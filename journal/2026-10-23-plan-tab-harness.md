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
- Kandidat `~/.local/share/pandaos-releases/plan-tab`: Hardlink-Kopie von `quota-steer-fix-current`, 18 ersetzte Dateien laut `.dev/plan-tab/files.txt`, Hashes und `node --check` bestanden, Live-Release unverändert. Quellstand von Live und HEAD vor der Änderung identisch.
- `pandaos-planned-restart --dry-run --release …/plan-tab` bestanden (`.dev/plan-tab/restart-preview.log`, 8 Sessions würden gefragt).

## Offen

- Commit auf main freigegeben („main mergen“). Live wechselte inzwischen auf `turn-id-reuse-fix`; der Kandidat `plan-tab` wird daraus neu aufgebaut, damit der Turn-ID-Fix erhalten bleibt.
- Freigabe für den geplanten Neustart auf den neuen Kandidaten.
- Danach: echte Claude- und Codex-Session im Tasks-Tab mit `browser_test` prüfen.
- Abgeleitet, nicht geprüft: Nach dem Neustart starten die Provider-Prozesse neu (Claude-CLI mit neuem Env, Codex `thread/resume` mit Anweisung und Konfiguration), daher sollten auch laufende Sessions den Plan nutzen.
