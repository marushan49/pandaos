# AGENTS.md als gemeinsamer Standard

Stand: 2026-10-20. Nutzerauftrag: eigene Agentenanweisungen überall auf AGENTS.md umstellen; vorhandene Regeln erhalten.

## Umgesetzter Umfang

75 eigene CLAUDE.md-Anweisungsdateien auf diesem Linux-Host sind in 75 AGENTS.md-Ziele überführt und entfernt. Dazu gehören eigene Projekte, Worktrees, Server-Unterverzeichnisse und das Second Brain. Vorhandene reine Weiterleitungen wurden entfernt, abweichende substantielle Regeln übernommen. AGENTS.md-Symlinks auf die bisherige CLAUDE.md sind jetzt reguläre Dateien. Die `.claude/CLAUDE.md`-Regeln des AI-Platform-Projekts wurden in dessen Root-AGENTS.md integriert, einschließlich der PR-/Merge-Regeln.

Die globale kanonische Datei bleibt `/home/admin/.config/agent-instructions/AGENTS.md`. `~/.claude/AGENTS.md`, `~/.codex/AGENTS.md` und `~/.config/opencode/AGENTS.md` sind ihre Einstiege. Der alte globale `~/.claude/CLAUDE.md`-Symlink ist entfernt.

103 aktuelle Doku-, Link- und operative Promptvorlagen-Verweise sind angepasst. Im Serverguide führen die Root-/Doku-Links jetzt über die korrekten zwei Verzeichnisebenen. Historische Texte und Schutzprüfungen, die auch alte Dateinamen erkennen, sind kein aktiver Anweisungsstandard und werden nicht blind umgeschrieben.

## Claude und zukünftiges Setup

Claude bekommt über einen separaten kleinen Hook die Pflicht-Lesepfade zu globalen und geltenden Vorfahren-AGENTS.md. Beim Lesen/Bearbeiten in Unterverzeichnissen werden spezifische Regeln erkannt. SessionStart, UserPromptSubmit, PreToolUse und SubagentStart sind abgedeckt; gleiche Inhalte werden dedupliziert und Änderungen erkannt. Große Regelblöcke werden nicht in kurze Hook-Ausgaben kopiert. Die vollständigen Dateien bleiben die Quelle.

Quelle: `/home/admin/.agents/skills/second-brain/scripts/agents_context.py`; aktive Kopie: `/home/admin/.config/9elf26-second-brain/bin/agents_context.py`. Alle vorherigen Claude-Hooks sind erhalten. Das Second-Brain-Setup installiert den Loader künftig mit und legt ausschließlich den AGENTS.md-Vertrag an. Die kanonischen Regeln und die pstack-Hostanpassung untersagen das Neuerzeugen von providerbezogenen Anweisungsdateien aus `/init` oder Vorlagen.

Der vorhandene Daemon-Prompt-Anhang verweist ebenfalls auf diesen Standard. Aktivierung wurde als Änderung ausschließlich von `daemon.appendSystemPrompt` bestätigt, Request `2de8603e-fda9-4bc3-b7b0-e36d2eee0b9b`. Kein Daemon-Neustart oder Geräte-Rollout.

## Verifikation

- Alle 75 alten Zielpfade fehlen; alle 75 AGENTS.md-Ziele existieren. Der komplette geplante Inhalt wurde nachgelesen und verglichen; lediglich Dateiverweise wurden normalisiert und Serverlinks berichtigt.
- Migrations-Selbstchecks prüfen identische Inhalte, Übernahme abweichender Regeln, Entfernen reiner Weiterleitungen und das Auflösen des bisherigen AGENTS.md-auf-CLAUDE.md-Symlinks ohne Regelverlust.
- 15 gezielte Setup-Tests bestanden, einschließlich Idempotenz, Erhalt bestehender Hooks und Prüfung, dass Setup keine CLAUDE.md mehr erzeugt. Fünf gezielte Loader-Tests bestanden: Hierarchie, Inhaltsänderung/Compaction/Subagent, Worktree-Deduplizierung korrektes Hook-Protokoll im Fehlerfall und ungültige Tool-Eingaben ohne Absturz.
- Neuer Claude-Agent `1a24a6ed-32f9-453a-a946-4cd9a2b29ea8` startet ohne eigene CLAUDE.md-Einstiege und liest `packages/server/AGENTS.md` tatsächlich. Er beantwortet die geltenden Prüf- und Hauptdaemon-Neustartregeln mit Quellen. Sein Discovery-State enthält globale, Home-, Root- und Server-AGENTS.md. Der Tool-Verlauf belegt den Read des Serverguides; die übrigen als geladen bezeichneten Inhalte sind im kuratierten Tool-Verlauf nicht jeweils als separater Read sichtbar.
- Read-only-Advisor `1b29203b-113a-4350-be21-7690278c93b8` prüfte die Ladewege vorab. Die Abschlussprüfung der konkreten Implementierung fand veraltete Code-Kommentarverweise, den alten Namen im Dangling-Link-Test und einen Absturz bei ungültigem `tool_input`. Die Kommentare sind entfernt, das Fixture verwendet `missing-target.md`, der Loader validiert das Eingabeobjekt. Der vorhandene File-Explorer-Test besteht mit vier Fällen. Die bestehende `/home/admin/AGENTS.md` wurde inhaltlich geprüft und bleibt erhalten: Sie enthält Sicherheitsregeln; Trading-Bot-Befehle betreffen ausschließlich dessen Aufgaben.

Server-Typecheck (`npm run typecheck` im Serverpaket), gezieltes Lint der vier bereinigten TypeScript-Dateien und Formatierung der betroffenen Repo-Dateien bestanden. Insgesamt 20 gezielte Python-Checks und vier bestehende File-Explorer-Testfälle grün. Der Abschluss-Heartbeat ist entfernt; keine Hintergrundjobs oder offenen Prüfungen.

## Belege und Wiederherstellung

Inventar, Zielplan, Referenzliste, Inhaltsprüfung und Claude-Toolbeleg liegen unter `/home/admin/projects/pandaos/.dev/agents-md-standard/`. Quelldateien und Symlinkziele sind gesichert: `/home/admin/.local/share/agent-instructions/backups/20261020-023444`. Globale Konfiguration vor Änderung: `/home/admin/.local/share/agent-instructions/backups/20261020-023444-global`. Sicherungen verwenden Blobnamen und ein Manifest; keine zweite aktive Anweisungsdatei wird daraus geladen.

## Grenzen

Die ursprüngliche Dateisuche fand 152 Dateien. Die verbleibenden 77 Einträge gehören zu unveränderten Fremdpaketen/-referenzklonen, historischen Release-/Backup-/Exportkopien und sechs beschreibenden `claude.md`-Referenzdokumenten. Diese sind von der Umstellung aktiver eigener Anweisungen ausgenommen. Ein nicht lesbarer Hindsight-Datenspeicher konnte nicht inventarisiert werden. Keine Änderung oder Übernahme auf einem anderen Host, insbesondere dem Mac, behauptet.

Keine App-/Produktlogik geändert; ausschließlich veraltete Kommentare entfernt und einen Test-Dateinamen neutralisiert; keine breiten App-Tests, Builds, CI-Läufe, Publikation, Commits, Pushes oder Zeitbuchungen. Bestehende WIP-Änderungen bleiben erhalten. Agent-Sessions und Browser-Tabs bleiben offen.
