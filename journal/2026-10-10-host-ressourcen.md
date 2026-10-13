# Host-Ressourcen, 10. Oktober 2026

Stand: rund 32 GB von 62,5 GB verfügbar. Swap ist voll, ohne akuten Druck. Kein Emulator läuft.

## Gestoppt

- Dev-Umgebung `provider-account-identity` (Daemon und Dev-App). Keine offenen Verbindungen. Die zugehörige Session wartet seit dem 8. Oktober 23:46.
- Start, falls du sie wieder brauchst (nicht getestet):
  `systemctl --user start pandaos-dev-daemon@provider-account-identity.service pandaos-dev-app@provider-account-identity.service`

## Geändert

- Der Host-Monitor zeigte bisher den anteiligen Speicher (PSS). Das ist nicht das, was ein Stopp freigibt. Jeder Verbraucher zeigt jetzt „frees X GB on stop“ (privater Speicher). Die Erzählung nennt die Summe der Dienste ohne Verbindung oder Backend.
- Plugin neu geladen, Status „running“.

## Offen, Entscheidung nötig (9elf26, Arbeit)

- Riesling-Watcher (PID 8054): kein Backend, frei bei Stopp 0,63 GB.
- dcai-2185-Watcher (PID 3949304): Backend ohne Verbindung, frei bei Stopp 1,07 GB.
- dcai-2190-Watcher (PID 1048031): 232 unkommittierte Dateien, nicht ohne Prüfung stoppen.

## Nachtrag, 10. Oktober 14:09

- Riesling- und dcai-2185-Watcher (inkl. Backend) gestoppt, Port 4136 frei. Vorher war keine Verbindung aktiv.
- Die Vite-Frontends der beiden Worktrees (rund 0,2 GB) und der dcai-2190-Watcher laufen weiter.
- Restart-Befehle und Unit-Details: `~/.pandaos/9elf26-units-before-stop.txt` (nicht getestet).
- Die Units sind `enabled` und starten nach einem Neustart wieder. Offen: deaktivieren ja oder nein.

## Agent-Schicht, Plan vom 10. Oktober

- Jeder Agent-Prozess trägt `PASEO_AGENT_ID` in seiner Umgebung. Der Monitor liest nur diesen Schlüssel und ordnet Prozesse exakt einem Agent zu. Systemd-Dienste wie Emulatoren und Watcher erben die Variable nicht und bleiben beim Besitzer über Unit und Ordner.
- „Check need“ fragt einen idle Agent, ob er seine Prozesse noch braucht. Ein Klick kostet einen Turn beim Besitzer. Danach bewertet ein günstiger Triage-Agent die Antwort (`codex-plus/gpt-6-luna`, Denkstufe low). Er läuft als Subagent des Besitzers und wird danach archiviert. Sperre: 30 Minuten pro Agent.
- Live geprüft am 10. Oktober: Owner-Agent gefragt, Antwort gelesen, Urteil `not_needed` mit Begründung. Owner und Triage-Agent sind archiviert und nicht mehr in der aktiven Liste. Nicht geprüft: der Klick „Check need“ in der App. Der Test lief über ein Skript in `/tmp`, nicht im Repo.
- Der Daemon erlaubt Plugin-Clients nur eine Agent-Liste pro 30 Sekunden (Sparregel, `resource_policy_status_limit`). Das Plugin nutzt die letzte Liste 31 Sekunden lang. Ohne diesen Cache scheitert ein zweiter Snapshot innerhalb von 30 Sekunden.
- Auto-Stop, eng: nur bei akutem Druck (unter 5 GB frei, Swap zu 95% voll), nur Emulatoren mit systemd-Unit, ohne ADB seit 30 Minuten. Aus: Datei `~/.pandaos/host-monitor/autostop-off`. Protokoll: `~/.pandaos/host-monitor/stopped.log`. Die Owner-Frage bleibt manuell, weil sie unter akutem Druck zu lange dauert.
- Nicht angefasst: die 9elf26-Dev-Backends. Sie starten nach dem Login wieder, weil die Units enabled sind. Die Entscheidung liegt bei 9elf26.

## Regel

Dev-Dienste ohne Verbindung und ohne Backend werden gestoppt. Bei Arbeit von 9elf26 entscheidet der Nutzer.
