# Main-Zusammenführung und Worktreebereinigung

## Auftrag und Stand

Alle lokalen Produktänderungen nach main übernehmen, danach Nebenworktrees entfernen. Zusätzlich die Aufgabenansicht nach der Claude-Code-Referenz kompakt und rund gestalten. Chats und Browser bleiben offen.

Implementierung und Git-Zusammenführung fertig. 13 von 14 Nebenworktrees entfernt. Eine externe laufende Claude-Desktop-Session nutzt noch `.claude/worktrees/browser-session-architecture-d8bed5` (PID11093, Parent8751); dieser Worktree bleibt bis zur ausdrücklichen Antwort auf die offene Rückfrage erhalten. Sein HEAD ist bereits in main enthalten. Kein anderer eigener Build-/Installjob offen. Heartbeat d7f2efbc während der Arbeit; bei Übergabe nur noch Nutzerantwort ausstehend.

## Inhaltserhalt

Vor Mutationen vollständige tracked Patches und untracked Quellen unter `.dev/e2e-progress/merge-safety/` gesichert. Abhängigkeiten und generierte Exporte ausgeschlossen. Inventar: `.dev/e2e-progress/merge-inventory.json`.

30 lokale Branchheads geprüft: 16 patch-id-gleich, 13 durch konkret belegte Squash-/Weiterentwicklungscommits abgedeckt. Mail Breeze fehlte und wurde mit allen33Dateien übernommen. Quellen-/Commitbelege stehen in `.dev/e2e-progress/branch-audit.md` und `dirty-tree-audit.md`. Historische ganze Dateien hätten neuere Browser-/Android-/Sicherheitskorrekturen zurückgesetzt und wurden deshalb nicht zurückkopiert. Der optionale Generative-UI-Prototyp hatte19uncommittete Quelldateien; diese einschließlich seiner Rezepte und Dokumentationslinks gesichert.

Sachcommits: `2e1bd40a6` Skill Deck statt Aktienplugin; `b0e70705a` Aufgabenkarte/Symboltabs/sicherer Browserfortschritt; `f7186f849` Mail Breeze; `9483fcd61` optionaler Generative-UI-Prototyp; `a4ab22c75` gespeicherte Browserrezepte; `1d863f063` Titel während Aufgabenhistorie lädt. `6935e86b3` hält die30geprüften Branchhistorien fest, ohne den geprüften Quellbaum zu verändern. Der alte detached Release cba28146e war ebenfalls patch-id-gleich und ist durch `2afa2c615` als Historie enthalten.

## Prüfung und Aktivierung

- Server-/SDK-Stack gebaut. Monorepo-Typecheck einmal ausgeführt; alle Workspaces außer zunächst fehlenden Prototyp-Abhängigkeiten grün. Nach deren gepinnter Installation nur den fehlgeschlagenen Plugin-SDK-/Beispielcheck wiederholt: grün. Kein Vollsuite-Lauf.
- Scoped Format/Lint, Skill-Deck- und Mail-Breeze-Typechecks grün. Mail Breeze21/21Tests; Generative UI60/60Ergebnisse in zwei Vitest-Projekten. Letzter Task-Fallback: scoped Format/Lint und App-Typecheck grün. Quellen und Logs unter `.dev/e2e-progress/`, besonders `integrate-check.log`, `finish-integrate-check.log`, `check-task-fallback.log`.
- Bereits geprüfte unveränderte Backend-/App-Tests nicht wiederholt. Commit-Hooks führten Format/Lint aus; der bereits abgedeckte Typecheck wurde bei den Sachcommits über `LEFTHOOK_EXCLUDE=typecheck` nicht erneut gestartet.
- Aufgabenkarte im tatsächlichen Produktbrowser auf- und zugeklappt, endgültigen Screenshot selbst angesehen. Zotac-Web und Mac-Electron statisch aktualisiert, Mac signiert/geöffnet und Hash geprüft. Kein Daemonrestart. Aktuelle UI-Belege und Grenzen im [UI-Journal](2026-10-22-e2e-progress-icons.md).

## Laufzeit und Bereinigung

Mail-Breeze-Source über `patchDaemonConfig` auf `/home/admin/projects/pandaos/mail-breeze` verlegt und über `reloadPlugin` erfolgreich neu geladen. Settings und Identität erhalten. Der vorangegangene Installversuch wurde erwartungsgemäß wegen bereits belegter ID abgewiesen; keine Mutation. Die beiden bisherigen Chats `8aada5e2-6710-49d1-b436-5ee8068301e1` und `1f7fca7b-6f2b-40af-bed1-575b49b66d92` über `moveAgentToWorkspace` ins Hauptworkspace verschoben und rückgelesen. Keine Agenten archiviert.

Die fünf registrierten Nebenworkspaces anschließend über PandaOS `archivePaseoWorktree` entfernt, jeweils `removedAgents:[]`. Acht weitere alte Release-/Arbeitsworktrees nach Ancestor- und Prozessprüfung entfernt. Der aktive Live-Release `e2e-progress-icons-final` bleibt erhalten. Laufzeitbelege: `relocated-runtime.json`, `archived-side-workspaces.json`, `remove-merged-worktrees-final.log`. Sicherheitssnapshots bleiben bis zur abgeschlossenen Bereinigung erhalten.

## Grenzen

Der nicht aktivierte Generative-UI-Prototyp enthält unverändert den gepinnten MCP-SDK1.29.0. `npm audit --omit=dev` meldet dafür eine direkte High-Abhängigkeit, behoben laut Registry in1.32.1. Kein ungeprüftes Abhängigkeitsupgrade im Mergeauftrag vorgenommen. Audit gespeichert unter `.dev/e2e-progress/generative-audit.json`.

Delivery Gate: tatsächlicher Git-/Laufzeit-/Buildstatus belegt; keine erfundenen Tests. Kartenfunktion und betrachteter Leer-/Ladezustand bestanden, native Mac-Sichtprüfung und neue Multi-Todo-Kartensicht ungeprüft. Restbereinigung wartet ausschließlich auf die Entscheidung zur externen Claude-Session.
