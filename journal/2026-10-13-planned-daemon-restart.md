# Geplanter Daemon-Neustart mit Checkpoints (2026-10-13)

## Ziel

Den Daemon neu starten, ohne auf Leerlauf zu warten und ohne Arbeit zu verlieren: Sessions vorher warnen, ihren Stand einsammeln, neu starten und jede Session danach an ihrem Checkpoint fortsetzen lassen.

## Entscheidungen

- Session Recovery besitzt den Ablauf: `restart.prepare` (startet im Hintergrund, dazu `restart.status` zum Abfragen), `restart.resume`. Lange RPCs vermeiden das Request-Timeout.
- Gefragt werden laufende Sessions und Sessions mit Aktivität in den letzten 15 Minuten, per `run()` mit `steer`, parallel, höchstens 180 s.
- Antwort im Format `STATUS: working | watching | done` plus `CHECKPOINT`. Ohne erkennbaren Status gilt `working`.
- Eine beantwortete Session gehört 24 h dem geplanten Neustart: Die automatische Wiederaufnahme lässt sie aus, `resume` setzt sie genau einmal fort. Ohne Antwort oder mit offener Freigabe bleibt der bisherige Unterbrechungsweg.
- `bin/planned-restart.mjs` läuft als eigene systemd-Unit, schaltet optional den Release um, prüft Dienst, serverId und Web-Bundle und rollt sonst zurück. Auf dem Zotac als `pandaos-planned-restart` installiert. Der gemeinsame Skill `pandaos-daemon-restart` verweist alle Provider darauf.
- Die alten Skripte `pandaos-restart-when-idle` und `pandaos-rollout-idle` bleiben liegen, der Skill ersetzt sie als Weg.

## Belege

- Plugin-Test `server/recovery.test.ts` 28/28, neuer Fall: Checkpoint nach Epochenwechsel genau einmal zurück, keine automatische Doppel-Fortsetzung.
- Typecheck, Lint und Format des Plugins sauber.
- Plugin live neu geladen, `pandaos-planned-restart --dry-run` listet 15 Sessions ohne etwas zu senden.

## Erster echter Lauf (19:09, Release 2d3042380-scroll-fix)

- 17 Sessions gefragt, Neustart nach 3 min, Daemon gesund auf dem neuen Release, Web-UI liefert das Bundle mit dem Scroll-Fix.
- 12 Sessions mit `working`/`watching` bekamen ihren Checkpoint zurück, 5 mit `done` nichts, die eine ohne Antwort kam über den normalen Unterbrechungsweg zurück.
- Fehler 1: Bei Sessions mitten im Zug endete `run()` mit diesem Zug, gespeichert wurde dessen letzte Antwort statt der STATUS-Antwort. Behoben: Das Plugin wartet bis zur Frist auf eine Antwort mit `STATUS:`, ohne sie gilt die Session als nicht beantwortet.
- Fehler 2: Das Skript wiederholte `resume`, während der erste Aufruf noch lief, eine Session bekam ihren Checkpoint doppelt. Behoben: `resume` läuft je Lauf genau einmal im Hintergrund, das Skript fragt `restart.status` mit `phase: resume` ab.
- Tests 29/29 mit beiden Fällen.
