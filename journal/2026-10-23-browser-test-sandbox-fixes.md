# 2026-10-23 browser_test, Codex-Sandbox und Tasks-Überschrift

Folgeauftrag zu [Plan im Tasks-Tab](2026-10-23-plan-tab-harness.md): die dort gefundenen Mängel beheben.

## Codex-Sandbox

- Ursache: Ubuntu 24.04 setzt `kernel.apparmor_restrict_unprivileged_userns=1`. bwrap 0.9.0 läuft unter dem Profil `unprivileged_userns` und scheitert bei `--unshare-net` mit `loopback: Failed RTM_NEWADDR: Operation not permitted`. Codex 0.159.0 verlangt bwrap für dateisystembeschränkte Befehle; `features.use_legacy_landlock` bricht mit „filesystem-restricted execution requires bubblewrap“ ab.
- Fix auf dem Zotac (Host-Konfiguration, nicht im Repo): `/etc/apparmor.d/bwrap` mit `profile bwrap /usr/bin/bwrap flags=(unconfined) { userns, }`, geladen mit `apparmor_parser -r`. Rücknahme: `sudo apparmor_parser -R /etc/apparmor.d/bwrap && sudo rm /etc/apparmor.d/bwrap`.
- Abwägung: Jeder lokale Prozess kann über bwrap wieder einen User-Namespace mit Capabilities anlegen; die Ubuntu-Härtung gilt für bwrap nicht mehr. Andere Programme bleiben beschränkt.
- Geprüft: `codex sandbox -- …` läuft, Schreiben nach `/etc` und Netz bleiben gesperrt. Codex-Testsession `770629c8` führte `wc -l README.md` ohne Freigabefrage aus (180).

## browser_test

- Mehrdeutige Klicks: `selectorFor` in `verify/page-snapshot.ts` brach nach 10 Ebenen ab; tiefe React-Native-Web-Knoten bekamen unverankerte Pfade. Jetzt läuft der Pfad weiter, bis er eindeutig ist. Auf der echten PandaOS-Seite: alt 92 von 161 Selektoren mehrdeutig, neu 0, keiner zeigt auf ein anderes Element; „Open Explorer sidebar“ alt 3 Treffer, neu 1.
- Fehl-PASS: Ein Goal bestand, wenn sein Prüftext schon vorher irgendwo auf der Seite stand, auch ohne Aktion. Jetzt fragt der Runner Jev in genau diesem Fall einmal, ob das Ziel nur prüft oder ändern soll. Prüfziel: passed. Änderungsziel: `uncertain` mit Hinweis. Doku: `public-docs/browser.md`.
- Tests: `jev-goal-runner.test.ts`, `page-snapshot.test.ts`, `tools.test.ts` grün; drei neue Goal-Tests. `recipe-runner.test.ts`: Goal-Rezept-Test jetzt grün; 4 Tests (Login-Fixture „Reference expired“) scheitern schon auf HEAD ohne diese Änderungen, nicht behoben.

## Tasks-Überschrift

- Tab-Titel und Kartenüberschrift lauteten beide „Tasks“. Die Karte zeigt jetzt den Sitzungstitel einzeilig gekürzt (`Button.numberOfLines`); der Körper nutzt den Titel nicht mehr als Ersatztext.

## Rollout und Abnahme

- Commits `8f1f29b92`, `64f373c9d`, `a30a784e4` auf main, gepusht.
- Mac: `install-mac.sh` mit Hash-Sicherung ausgeführt, `index.html` `3e3fcbc2…`, neu signiert, App neu gestartet. Backup `rollout-backups/browser-test-fixes-20261023-223737`. Die Mac-App hat damit auch den neueren Zotac-UI-Stand (u. a. Set aside/Snooze).
- Geplanter Neustart `browser-test-fixes-20261023`: Daemon auf `browser-test-fixes`, serverId `srv_RtppvtlARpFR` unverändert, alte Releases auf 3 plus aktiv reduziert.
- Klick: `browser_test` `evr_5c078d5f` schloss und öffnete die Seitenleiste per Rolle/Name („Close/Open Explorer sidebar“) ohne Strict-Mode-Fehler; als Rezept `explorer-sidebar-toggle-unique` nicht gespeichert, weil der erste Versuch fehlschlug.
- Tasks-Karte: Überschrift „Test: Plan im Tasks-Tab (Codex)“ unter dem Tab „Tasks“, keine doppelte Überschrift, nichts abgeschnitten. Bild angesehen: `evr_2e804508`, Produktbrowser 1280×720, normale Schrift. Sichtprüfung bestanden; Mac-App nicht visuell geprüft.

## Neue Befunde, nicht behoben

- Verfallene Refs: Über `/agent/<id>` geladene Seiten leiten per `replaceState` auf `/workspace/<id>` um. Playwright meldet das als `framenavigated`, der Host leert den Snapshot, und ein Klick direkt danach scheitert mit „Reference … expired“ (`evr_f2ca3cf4`). Mit der Workspace-URL bestand derselbe Lauf. Vermutlich dieselbe Ursache wie die 4 schon auf HEAD scheiternden `recipe-runner`-Tests; nicht geprüft.
- Codex-Pläne nach Neustart: Die Timeline der Codex-Testsession enthielt vor dem Neustart `[Tasks]`, danach nicht mehr; der Tasks-Tab zeigt „No tasks yet.“ PandaOS übernimmt Codex-Pläne nur live aus `turn/plan/updated`, nicht aus der Historie. Für Claude baut `ClaudeTaskState` sie beim Replay auf; live nicht geprüft.
