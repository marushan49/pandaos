# 2026-10-22 Globaler Build-Scheduler

Auftrag: `pandaos-android-queue` (ein Job gleichzeitig) durch einen ressourcenbewussten, globalen `pandaos-build-scheduler` ersetzen, kompatibel, ohne laufende Jobs zu verlieren.

## Fertig-Kriterien

- Mehrere Jobs laufen parallel, Zulassung nach gemessenem RAM, CPU und Druck (PSI).
- Klassen light/medium/heavy, Prioritäten, Alterung gegen Starvation, Fairness pro Agent, Sperre pro Build-Verzeichnis.
- Scheduler-Neustart verliert weder wartende noch laufende Jobs; Client verbindet sich neu.
- `pandaos-android-queue` und die Java/SDK-Guards funktionieren unverändert weiter, alter Broker bleibt als Rückfall installiert.
- Entscheidungen mit Zeitstempel und Begründung in `/var/lib/pandaos-build-scheduler/decisions.jsonl`.
- Testmatrix 1–10 aus dem Auftrag mit echten Läufen, Vorher/Nachher-Messung.

## Bestandsaufnahme (verifiziert, 22.10. 23:00)

- Host: i5-13400, 16 Threads, 62 GiB RAM, 17 GiB Swap (5,8 GiB belegt), NVMe.
- Grundlast ohne Builds: Agenten (`user.slice`) 7,6 Kerne und 40,6 GiB inkl. Cache, `MemAvailable` 39 GiB, CPU-PSI some 12–15 %, Memory-PSI 0.
- Alter Broker: `/usr/local/lib/pandaos-android-queue/android_queue.py`, Quelle `scripts/android-queue/`, eine `work()`-Schleife, Zustand nur im Speicher.
- Journal 22.10.: 151 Jobs, Laufzeit p50 22 s, p90 212 s, max 24 min; 116 Jobs unter 2 min. Mittlere Kernnutzung p90 1,85, also am Limit `CPUQuota=200%`. Größte Spitzen 5,7–6,2 GiB (Android-Builds).

### Ursachen der Blockierung

1. Genau ein Slot, FIFO: kurze Tests warten hinter APK-Builds.
2. Langlebige Prozesse halten den Slot: #305 war `node plugin/tests/e2e.mjs --serve` mit 2 h Laufzeitgrenze.
3. Historische Drosselung: `CPUQuota=200%`, Gradle `workers.max=1`, `ActiveProcessorCount=2`, `-Xmx3g` verlängern jeden Build.
4. PandaOS-APK-Build (`~/.local/bin/pandaos-android-build`) macht pro Commit `expo prebuild --clean` in einem neuen Release-Ordner: jedes Update ist ein nativer Kaltbuild, ohne Gradle-Build-Cache und ohne ccache.
5. Broker-Neustart verwirft alle wartenden Jobs.

Technisch nötig bleiben: Zero-Swap pro Job, harte Speichergrenze pro Job und für alle Builds zusammen, Ausführung außerhalb der Agent-cgroup, keine persistenten Gradle-Daemons. Historisch: der Einzelslot und die 2-Kern-Grenze.

## Stand (23.10. 10:30)

- [x] Bestandsaufnahme
- [x] Scheduler `scripts/build-scheduler/`, installiert 22.10. 23:13, Smoke 13/13
- [x] Umstellung Wrapper/Guards 22.10. 23:24 (`install.py --switch`), Backup `/var/backups/pandaos-build-scheduler/20261022T212455160000Z`; alter Broker hat seine Restjobs selbst abgearbeitet
- [x] Tests 1–8 und 10 mit echter Last (siehe Messungen), Test 9 Schutzpfad
- [x] Host-Regel `~/.config/agent-instructions/AGENTS.md` Abschnitt „Build-Scheduler“ (Backup `AGENTS.md.vor-build-scheduler-20261023.bak`), `pandaos-workflow/references/pandaos.md`, Session-Recovery-`TOOLING_POLICY` (wirkt erst nach Plugin-Reload, Freigabe offen), `docs/runtime-recovery.md`
- [x] Session-Recovery typecheck, 29/29 Tests
- [x] `pandaos-android-update` (Gradle/Expo/Flutter): Änderungsklasse, inkrementeller Build, Installation mit Paket-/Signatur-/Versionsprüfung
- [ ] README, Commit/PR, Test-Worktrees aufräumen
- [x] Phase 1 abgeschlossen, Rollback echt geprüft (Hin- und Rückweg 23.10. ~10:45), Test-Worktrees entfernt; Commit `ae684f590` durch Root-Agent
- [x] Konflikt: Agent `152810f3` aktivierte um 10:29 eigenmächtig den Mac-Worker von `ad7f6af6`; Marushan entschied „behalten“; `workers.macbook.enabled=false` seit ~10:50, Backup `/var/backups/pandaos-build-scheduler/config.json.mac-enabled-*`, eigener Vorstand in `.dev/build-scheduler/own-before-mac-worker/`
- [x] Phase 2 vorbereitet, installiert und deaktiviert (23.10. 10:40): `--worker auto`, Fertigstellungszeit-Schätzung, iOS nur macOS, Akku-/Nutzungsschutz, Werkzeugprobe, rsync-Snapshots ohne Secrets/Plattformausgaben, Artefakt-Rückholung
- [ ] Aktivierung Mac-Worker: Freigabe Marushan nötig
- [x] Play-Pipeline `pandaos-play-release` echt geprüft: Status lesend, chillbro-AAB 33 mit Tests über den Scheduler gebaut (1:45 min), Signatur geprüft, Upload ins Edit + `validate` 200 + Edit verworfen; Tracks danach unverändert 32. Nichts veröffentlicht.
- [x] iOS-Pipeline `pandaos-ios-release`: App-Store-Connect-Status echt gelesen (Builds 25–29 VALID, 1.0 WAITING_FOR_REVIEW); Build/Export auf dem Mac nur als Trockenlauf, echter Lauf braucht aktivierten Mac-Worker
- [x] Plugin `plugin-examples/build-scheduler` (Panel „Builds“): Typecheck, 2/2 Tests, Lint, Live-Abfrage gegen den echten Scheduler; Installation/Sichtprüfung braucht Freigabe (Plugin-Reload)
- [x] Codex-Review 1 (`.dev/build-scheduler/codex-review-1.md`): 12 Befunde, alle behoben in `3cf6adbb4`, Hostwahl-Tests 20/20, echte Mac-Prüfung PATH/GRADLE_OPTS/.npmrc-Ausschluss
- [x] Live-Reload statt APK bei reinen JS/Dart-Änderungen in Debug-Builds; Flutter-Worktree mit Cache 39,2 s statt 105,6 s kalt
- [ ] Codex-Review 2 läuft

## Zuständigkeiten

- Dieser Agent: `scripts/build-scheduler/**`, `/usr/local/lib/pandaos-build-scheduler`, `/etc/pandaos-build-scheduler`, Slice/Service-Units, `TOOLING_POLICY`, AGENTS.md-Abschnitt „Build-Scheduler“, `docs/runtime-recovery.md` Abschnitt Build-Scheduler.
- Agent `152810f3` (PandaOS-Android-Workflow): `scripts/android-host-build.py`, `scripts/prebuild-android.mjs`, `.worktrees/android-build`, `.worktrees/android-workflow`, `docs/android.md`, alle Xiaomi-Installationen.

## Messungen

| Messung                                          | Vorher                       | Nachher                                    |
| ------------------------------------------------ | ---------------------------- | ------------------------------------------ |
| Wartezeit leichter Jobs (`npm run format:files`) | 188 s im alten Slot          | 0 s                                        |
| Wartezeit `cargo test`                           | 195 s                        | 0 s                                        |
| chillbro `assembleDebug` kalt                    | 63 s (2 Kerne, 1 Worker)     | 60 s (4 Worker, parallel zu Rust)          |
| chillbro frischer Worktree mit Build-Cache       | 60 s                         | 13,1 s (21/37 Tasks aus Cache)             |
| michelin `cargo test --no-run` kalt              | 48,6 s (2 Kerne)             | 39,1 s                                     |
| michelin frischer Worktree mit sccache           | 39,1 s                       | 25,1 s (104/111 Treffer)                   |
| Parallelität                                     | 1 Job                        | bis 8 + 3 leichte, gemessen 6 gleichzeitig |
| PandaOS-Release, JS-Änderung (Agent 152810f3)    | 119 s warm, 23 min 53 s kalt | 72,8 s, Queue-Wartezeit 0,9 s              |
| breathe-and-pray Flutter-Debug kalt              | –                            | 105,6 s parallel zu chillbro               |
| chillbro Kotlin-Änderung inkrementell            | –                            | 21,2 s (1 Task ausgeführt, 3 aus Cache)    |

`report 1` am 23.10. 10:35 (193 Jobs inkl. eigener Tests): Wartezeit p90 light 0 s, medium 33 s (aus den CPU-Zurückstellungstests), heavy 0 s; Gradle-Wiederverwendung 82 %, sccache 46 %, ccache 9 % (noch kalt). Größte Spitze 11,0 GiB (PandaOS-Release), also an `MemoryHigh` 11 GiB: Grenze nicht senken.

Stresstest: 7 × 5 GiB, RAM-Zulassung hielt 4 gleichzeitig, kein OOM-Kill. Neustart mit 5 wartenden und 3 laufenden Jobs: 0,18 s, alle fertig. Fairness: späterer Agent B lief vor A's Jobs 4–6.

## Gefundene und behobene Fehler

- `StateDirectory=` setzte beim Neustart Besitzrechte zurück, wiederhergestellte Jobs scheiterten: entfernt, Rechte beim Start repariert.
- Stop hing an offenen Client-Verbindungen bis SIGKILL: sofortiges Beenden nach Sicherung.
- Laufzeitgrenze meldete 143 statt 124; `logs` wurde als Einreichung gelesen.
- `pandaos-android-update` reichte aus dem Aufrufordner ein und sperrte dadurch fremde PandaOS-Jobs: wechselt jetzt in den Projektordner.
- Zustandsdatei im Projekt verfälschte die Änderungserkennung: liegt jetzt unter `~/.cache/pandaos-android-update/`.
- Play-APKs mit v3.2-PQC-Signatur: eigener Parser für Signaturblock v2/v3.

## Phase 2 Prüfungen (23.10.)

- Unit: Hostwahl 13/13 (offline, Akku, aktive Nutzung, iOS wartet, fehlende Werkzeuge, warmer Zotac bleibt, gemessen schnellerer Mac gewinnt, Mac-Kapazität), Worker 15/15, Smoke 13/13 nach Installation.
- Echt auf dem Mac (direkt über `remote_worker.run`, nicht über den Produktivdienst): Snapshot-Sync 0,3 s, Lauf auf darwin im Snapshot-Ordner, `.env`/Keystore/`build/` nicht übertragen, `JAVA_HOME`=Android-Studio-JBR, Artefakt zurück, gesamt 1,9 s.
- SSH-Abbruch: lokaler ssh-Prozess per SIGKILL beendet, Exit 125 ohne Wiederholung, Mac-Prozess nach ≤ 5 s weg.
- Mac-Werkzeuge: Node 24, Flutter, CocoaPods, adb, Android SDK, Android-Studio-JBR, Xcode 27.1; kein Cargo/ccache/sccache. Mac hat `openrsync` (kein `--protect-args`, kein `--relative /./`).

## Aktivierung Mac-Worker (nur mit Freigabe)

Vorbedingungen geprüft am 23.10.: Mac→Zotac-SSH über `zotac` (LAN) funktioniert, Zotac→Mac über `macbook`; Rollback in einem Schritt; Backups in `/var/backups/pandaos-build-scheduler/`.

1. Sichern: `sudo cp /etc/pandaos-build-scheduler/config.json /var/backups/pandaos-build-scheduler/config.json.before-mac-$(date +%s)`.
2. `workers.macbook.enabled=true` setzen, `auto_placement` zunächst `false` lassen; `sudo systemctl restart pandaos-build-scheduler` (0,15 s, laufende Jobs bleiben).
3. Healthcheck: `pandaos-build-scheduler workers`, `pandaos-build-scheduler --worker macbook worker-probe`, ein lokaler Job, ein `--worker macbook`-Job, `python3 smoke.py`.
4. Realtests: Android-Build `--worker macbook` und `--worker auto` gegen Zotac, iOS `pandaos-ios-release build` (Export ohne Upload), Mac-Akkubetrieb und -Nutzung, SSH-Abbruch, Neustart mit wartendem Mac-Job.
5. Danach optional `auto_placement=true`.
6. Rollback: `enabled=false` (bzw. Backup zurückkopieren) und Neustart; Mac-Snapshots liegen nur unter `~/.pandaos-worker/snapshots`.

## Offene Grenzen

- Meshnet-Weg Mac→Zotac (`zotac-mesh`) am 23.10. nicht erreichbar; LAN-Weg funktioniert.

- Erfolgreiche Geräteinstallation ungeprüft: Play Protect verlangt auf dem Xiaomi eine Bestätigung am Gerät.
- Neue `TOOLING_POLICY` erst nach Plugin-Reload aktiv (Freigabe nötig).
