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

## Stand

- Kandidat `~/.local/share/pandaos-releases/browser-test-fixes` aus `plan-tab`, Dateiliste `.dev/browser-test-fixes/files.txt`. Web-Export übernommen: gegenüber Live nur ein neues JS-Bundle, alle anderen Web-Dateien identisch. Probelauf des geplanten Neustarts bestanden (`.dev/browser-test-fixes/restart-preview.log`).
- Mac: Die installierte App-UI ist älter als die Zotac-Web-UI (ihr fehlt z. B. Set aside/Snooze aus `d870ee749`); sie hat keine Strings, die dem neuen Export fehlen. Paket mit Hash-Sicherung liegt auf dem Mac unter `/tmp/pandaos-browser-test-fixes` (`install-mac.sh`, alt `b4d7839f…`, neu `3e3fcbc2…`), nicht installiert.
- Offen: Freigabe für geplanten Neustart, Mac-Installation und Commit; danach Sichtprüfung der Tasks-Karte und ein `browser_test` mit Klick auf „Open Explorer sidebar“.
