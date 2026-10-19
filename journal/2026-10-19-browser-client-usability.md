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
