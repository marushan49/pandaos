# Host-Browser vom Client aus besser bedienbar

## Auftrag

Marushan bedient den Host-Browser nur vom Mac und vom Android-Handy aus; der Zotac hat keinen Bildschirm. Wichtiger als neue Einstellungen sind Bedienbarkeit vom Client und Login-Import vom Client. Danach folgen die vier Einstellungen: Seitenmenü, Browserdaten löschen, Downloads, Website-Berechtigungen.

## Befunde

- Der Host streamt CDP-Screencast-JPEGs. Der Viewport wird nur per `setViewportSize` auf Panegröße gesetzt; keine Pixeldichte. Mac-Retina und Handy sehen ein hochskaliertes, unscharfes Bild.
- Telefone bekommen keine Mobil-Emulation (kein Touch, kein mobiles Layout-Flag).
- Nach jedem Tipp läuft `takePageCopy` (ein `evaluate`) in der seriellen Befehlswarteschlange und verzögert den nächsten Tipp.
- Der Resize-Befehl hat ein striktes Schema; neue Felder brauchen das Host-Feature `browserDisplayMetrics`.
- Import: Mac-Desktop-App importiert Cookies und Passwörter bereits. Android-Browser geben ihre Cookies nicht heraus (App-Sandbox). Möglich ist der CSV-Export aus dem Google Passwortmanager, der über `browser.import.import_cookies` mit `logins` auf den Host geht.

## Plan

1. Android-Fix gegen doppelte Tastatureingaben übernehmen (Codex, `fix/android-browser-keyboard`). Erledigt: Commit `3a5970730`.
2. Host: `resize` nimmt optional `deviceScaleFactor` und `mobile`; CDP `Emulation.setDeviceMetricsOverride` und Touch-Emulation. Pixeldichte höchstens 2.
3. App: Pixeldichte und Mobil-Flag mitsenden, Seitentext-Kopie nach dem Tipp aus der Warteschlange nehmen.
4. Import: Passwort-CSV in den Einstellungen auf allen Clients; „…“-Menü im Browser-Tab mit Import und Einstellungen.
5. Danach Browserdaten löschen, Downloads, Website-Berechtigungen.

## Fertig-Kriterien

- Typecheck und Lint der betroffenen Pakete grün.
- Nach Daemon-Neustart: Stream auf dem Handy scharf, Mobil-Layout aktiv, Tipps ohne Zusatzwartezeit.
- CSV-Import legt Passwörter im Host-Profil an.

## Stand

- Welle 1 (`8672a4eea`): 2x-Pixeldichte über `--force-device-scale-factor=2` plus CDP-Geräte-Metriken je Tab, Mobil-Modus mit Touch für kompakte Clients (Host-Feature `browserMobileViewport`), Agent-Screenshots bleiben in CSS-Größe, Tipp wartet nicht mehr auf die Seitentext-Kopie, „…“-Menü (Suchen über `pane-find`, Zoom über kleineren Viewport, Import, Einstellungen), CSV-Passwortimport. Host-Prüfung mit echtem Chromium: Handy 393×700 CSS liefert 786×1400-Bilder, Pixeldichte 2, Touch an; Desktop schaltet Touch ab.
- Vor dem APK-Bau committet, weil schon auf dem Handy installiert: Download über aktive Verbindung (`b854a25b3`) und Tabellen-Lesbarkeit (`5c6890e7e`).
- Welle 2: Browserdaten löschen (Cookies, Websitedaten, Cache; importierte Cookies und Session-Snapshots werden mitgelöscht, Passwörter bleiben), Downloads landen in `PASEO_HOME/browser-downloads` und lassen sich in den Einstellungen aufs Gerät holen, Website-Berechtigungen mit Standard „blockieren“ außer Zwischenablage und Ausnahmen je Seite (Host-Feature `browserSiteSettings`). Chromium kann Abfragen nicht anzeigen; ohne Regel hing eine Standortabfrage 5 s, mit Regel 3 ms. `Browser.setPermission` wirkt nur mit `origin`, deshalb Anwendung bei jeder Hauptframe-Navigation.
- Grenzen: Android-Browser geben Cookies nicht heraus, nur Passwörter per CSV. Kein Mobil-User-Agent; responsive Seiten reichen über Breite und Touch.

## Auslieferung (Checkpoint)

- Mac: Welle 2 installiert über `pandaos-mac-install 39242176592`. Das Skript verglich fest mit Version 0.11.0 und rollte deshalb zurück; jetzt vergleicht es mit der installierten App-Version (Sicherung `pandaos-mac-install.bak-20261019`). Tabellen-Fix `7c19ca67f`: CI `39248403376`, danach automatische Mac-Installation.
- Tabellen im Web: `flex: 0` wird zu `flex-basis: 0%` und hebt die Spaltenbreite auf (16 px statt 293 px im Chromium-Nachbau); `flex: -1` behebt es.
- Android: `pandaos-android-build` blieb im Metro-Bundle unter den Queue-Limits stehen. Neuer Weg wie bei Codex: Hauptordner auf `7c19ca67f`, `build:app-deps`, Gradle mit den Init-Skripten aus `.dev/` (Hermes-O0-Diagnoseprofil). Skript und Log `.dev/browser-client/`. Dasselbe Skript baut das Server-Release `~/.local/share/pandaos-releases/7c19ca67f-browser-settings`.
- Offen nach dem Build: APK per `adb install -r` aufs Xiaomi, dann `pandaos-planned-restart --release ~/.local/share/pandaos-releases/7c19ca67f-browser-settings`. Freigabe liegt vor (19.10.2026).
- 14:05 APK `.dev/browser-client/PandaOS-7c19ca67f.apk` gebaut (2 min Gradle), SHA-256 `06f1a7e9…aedabed`, Signer `fac61745…` wie installiert, Bundle enthält Browser-Menü, Mobil-Modus und Website-Einstellungen. Release `7c19ca67f-browser-settings` gebaut. Mac mit Tabellen-Fix installiert (CI `39248403376`, MAC OK).
- Handy: Port 5555 geschlossen, kabelloses Debugging auf Port 49111 verlangt neue Kopplung. Installation wartet auf Kopplungscode von Marushan.
- Geplanter Zotac-Neustart auf `7c19ca67f-browser-settings` gestartet.
- 14:59 Erster Neustart zurückgerollt: Der alte Daemon brauchte 90 s zum Beenden, `pandaos-planned-restart` wartete nur 60 s auf `systemctl restart` und schaltete vorher zurück. Zeitlimit auf 180 s erhöht (Sicherung `.bak-20261019`), Neustart erneut gestartet.
- 15:01 Zweiter Neustart gesund, live `7c19ca67f-browser-settings`. Danach fand der Host-Browser kein Chromium: `playwright-core` 1.58.2 erwartet Revision 1208, im Cache lag nur noch 1217 (1208 war gelöscht, der alte Daemon lief noch mit dem gelöschten Binary). `node node_modules/playwright-core/cli.js install chromium` im Release installierte 1208; ohne weiteren Neustart funktionsfähig. Produktionsprüfung im Host-Browser: `devicePixelRatio` 2, Standort `denied`, Zwischenablage `granted`.
- Offen: Handy-Installation, wartet auf Kopplungscode.
- 15:22 Handy: Nach Kopplung mit Code installiert (`adb install -r` über das SDK-adb 37.0.1; das Debian-adb unter `/usr/bin` kann kein TLS). Installierte `base.apk` SHA-256 `06f1a7e9…aedabed` = Kandidat, versionName 0.11.2. Port 5555 wieder eingeschaltet (bis zum nächsten Handy-Neustart). Der adb-Server endet mit jedem Queue-Auftrag; Verbinden und Installieren gehören in einen Auftrag.

## Lokaler Browser und Profil-Hub

- Entscheidung (Marushan, 19.10.2026): Der Stream war für den Mac die falsche Architektur. Jeder Tastendruck ist eine Rundreise, und Chromes eigene Fenster (Passwort-Vorschläge, Speichern-Abfrage, Berechtigungen) liegen außerhalb des Screencasts. Neue Electron-Tabs sind wieder lokal (`afba8193a`), jeder Tab kann zwischen lokal und Zotac-Stream wechseln. Android und Web bleiben beim Stream. Agents bleiben auf dem Zotac-Browser.
- Profil-Hub (`ac6fe03a1`): `browser.profile.sync` führt Cookies (überschreibend, mit Löschungen), Passwörter (ergänzend) und Verlauf (mit Löschzeitpunkt) auf dem Zotac zusammen. Die Mac-App meldet Cookie-Änderungen sofort und gleicht beim Start, bei Fensterfokus und jede Minute ab; beim ersten Abgleich gewinnt der Zotac. Echte Chromium-Prüfung der Host-Seite und Wegwerf-Test der Abgleichregeln bestanden.
- Mac ohne CI: Electron-Oberfläche auf dem Zotac exportiert, `dist/main.js` und `dist/preload.js` direkt im installierten `app.asar` ersetzt (`.dev/browser-client/tools/patch-asar.cjs`), `ElectronAsarIntegrity` in `Info.plist` auf den neuen Kopf-Hash gesetzt, neu signiert. Sicherung unter `rollout-backups/profile-hub-20261019-171104`.
- Handy: APK `ac6fe03a1` über Port 5555 installiert, installierte SHA-256 `0a44e737…` gleich Kandidat.
- Grenze: Ein geändertes Passwort für dasselbe Konto überschreibt das alte nicht; neue Logins gleichen sich ab.
