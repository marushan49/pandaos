# Workflows direkt in PandaOS-Chats

Stand: 2026-10-20. Der beauftragte gemeinsame Skill-Einstieg ist auf dem Zotac eingerichtet und in einer neuen Codex-Session tatsächlich verwendet worden. Kitchen bleibt ausdrücklich außen vor.

## Ziel und Ergebnis

Marushan möchte hochwertige Features und Apps mit wenig menschlicher Zeit und angemessenen Agent-Kosten erstellen. Vorhandene Konzepte und Skills werden genutzt. Der Agent ordnet eine Aufgabe ein, lädt passende Skills und arbeitet bis zum überprüften Ergebnis. Kleine Antworten und eindeutige triviale Änderungen benötigen keinen zusätzlichen Workflow.

Installiert sind 56 pstack-Originalskills und 9 ergänzende cursor-team-kit-Skills aus der Karte des Videoautors, mit Lizenzhinweisen und SHA256-Manifesten auf `cursor/plugins` `ddf824aff1e55ba14bd666b30bce3fc69962abe6` fixiert. 64 Skills und der neue Einstieg sind für Claude, Codex und OpenCode verlinkt. `setup-pstack` bleibt als Originalquelle verfügbar, ist aber nicht automatisch registriert: Seine Cursor-Modellkonfiguration würde die bestehenden PandaOS-Profile umgehen. Keine upstream-Setupskripte oder Cursor-Automationen ausgeführt.

Der Einstieg liegt unter `/home/admin/.agents/skills/pandaos-workflow/SKILL.md`. `references/catalog.md` enthält die 65 Quellen und die PR-Playbooks; `references/pandaos.md` adaptiert Modelle, Werkzeuge, Worktrees, Freigaben und Fortschrittsspeicherung an diesen Host. Originale liegen unverändert unter `/home/admin/.agents/skill-packs/`.

## Einbindung

Die kanonische globale Agentendatei verweist vor materiellen Aufgaben auf den Einstieg und vor jeder direkten Anwendung eines importierten Skills auf die PandaOS-Anpassung. Dieselbe Regel ist der vorhandenen `daemon.appendSystemPrompt`-Anbindung hinzugefügt. Bestehende Anweisungen wurden erhalten. Das validierte CLI meldete `daemon.appendSystemPrompt` als live angewendet; JSON-Rücklesen bestätigte ausschließlich diese Feldänderung. Der Hauptdaemon behielt PID 869560.

Es gibt keine neue Engine, UI, zusätzliche Freigabeschalter oder Kitchen-Abhängigkeit. Fortschritt bleibt im vorhandenen Aufgabencheckpoint. Kleine Fehler nutzen passende bestehende Reproduktionen; größere Aufgaben erhalten nur die tatsächlich nötigen Entwurfs-, Review- und Verifikationsschritte. PR-Statusfragen bleiben einmalig lesend. Offene echte Produktentscheidungen werden gefragt; unabhängige Arbeit geht weiter.

## Verifiziert

- Der YouTube-Titel und die vollständige Videobeschreibung sowie die vom Autor verlinkte Skill-Karte wurden auf der geladenen Seite per PandaOS `browser_evaluate` gelesen. Die Karte ergänzt pstack um Team-kit-Review-/PR-Skills. Der defekte Snapshot-Collector wurde dabei nicht als Beleg für fehlende Inhalte behandelt.
- Skill-Frontmatter und unveränderte Quellchecksummen geprüft; der neue Einstieg besteht `quick_validate.py`. Alle lokalen Katalog-/Einstiegsverweise und 194 Discovery-Symlinks sind gültig. Die drei globalen Provider-Agentendateien zeigen auf die kanonische Datei.
- Unabhängiger Sonnet-Advisor `b945c7eb-d99d-4cf5-a7d9-9f91f976563f` prüfte sechs repräsentative Aufgaben und die Pfade. Daraufhin triviale Edits, schmale Erklärungen, reine PR-Statusfragen und offene Nutzerentscheidungen konkret abgegrenzt; den Cursor-Modellkonfigurator aus automatischer Discovery entfernt.
- Neue Codex-Session `55853854-5436-435e-af93-f2ff006b272a` erhielt nur eine konkrete lesende Codefrage, ohne Hinweis auf den Workflow. Ihr erster Shell-Aufruf las tatsächlich den neuen Einstieg, danach rief sie System One zur Auswahl direkt/how auf. Sie beantwortete den Auftrag selbst mit Quellbelegen. Beleg: `/home/admin/.agents/skills/pandaos-workflow/references/verification.json`.
- Config-Aktivierung: Request `99ab5c47-819b-44c4-9b49-8b24b1bd1a20`, Log `/tmp/pandaos-workflow-video/config-activation.log`. Sicherung vor Änderungen: `/home/admin/.local/share/pandaos/skill-backups/chat-workflow-20261020-022159`. Der Reload meldete sachfremde vorhandene mail-breeze-Restartpfade; diese wurden nicht geändert und kein Neustart ausgelöst.

## Grenzen

Eine laufende Provider-Session übernimmt einen Config-Reload nicht automatisch. Der Quellpfad für Start, tatsächliches Resume und Session-Reload ergänzt den jeweils aktuellen Daemon-Prompt; eine gewöhnliche weitere Nachricht garantiert keine Übernahme. Es wurden keine fremden Sessions unterbrochen oder neu gestartet.

Neue Codex-Session tatsächlich geprüft; Claude-Advisor und gemeinsame Discovery-Pfade geprüft. Vollständige Laufzeitabdeckung sämtlicher Provider, ein echter Resume-Versuch sowie ein Feature-/Bugfix-Ende-zu-Ende-Lauf sind nicht bestätigt. Die Anweisungen sind keine technische Garantie fehlerfreier Befolgung. Keine anderen Hosts oder Geräte geändert.

Das vollständige gesprochene Videotranskript bleibt nicht bestätigt: yt-dlp meldete HTTP 429, OpenCLI fehlt, Agent Reach hat keinen Transkriptionsschlüssel. Die Installation deckt die verifizierte Autorenkarte und das vollständige aktuelle pstack-Paket ab.

## Quellen

- Video: https://www.youtube.com/watch?v=4wBVuj2an8E
- Autorenkarte: https://erictechpro.github.io/super-board/pstack/
- pstack: https://github.com/cursor/plugins/tree/ddf824aff1e55ba14bd666b30bce3fc69962abe6/pstack
- Ergänzende Skills: https://github.com/cursor/plugins/tree/ddf824aff1e55ba14bd666b30bce3fc69962abe6/cursor-team-kit/skills
- Bestehende Config-Anbindung: `public-docs/configuration.md`, `packages/server/src/server/bootstrap.ts:1990`, `packages/server/src/server/agent/agent-manager.ts:1151` und `:6791`.

Keine App-Codeänderung; deshalb keine Builds, breiten Tests, CI oder Geräteinstallation. Fremde Änderungen in paseo.json und session-recovery blieben unberührt. Agent-Sessions und beide Browser-Tabs bleiben offen; der Abschluss-Heartbeat wird nach Dokumentation entfernt.
