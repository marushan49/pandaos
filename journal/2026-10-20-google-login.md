# Google meldet den Host-Browser ab (20.10.)

- Rückmeldung Marushan: Im Host-Browser muss er sich ständig neu bei Google anmelden (Play Console).
- Befund: Alle Google-Cookies im Live-Profil `~/.pandaos/browser-profiles/shared/default` stammen aus dem Cookie-Import vom Mac (18:03). Um 18:22 fehlten `SID` und `__Secure-1PSID`, nur `ACCOUNT_CHOOSER` und `__Host-GAPS` waren übrig, also „Signed out“. Google widerruft Konto-Cookies, die von einem anderen Gerät kopiert wurden. Das Profil und der Schlüsselbund (`gnome-keyring` seit 10.10.) sind stabil, alle 1361 Cookies sind lesbar (`v11`).
- Zweiter Fehler: Jeder spätere Import spielte den ganzen gespeicherten Bestand neu ein, auch alte Google-Cookies. Ein direkter Login im Host-Browser wurde so wieder überschrieben.
- Fix `cd7b2153e`: Der Import lässt `google.com` und `*.google.com` aus, auch beim erneuten Einspielen des gespeicherten Bestands. Die Rückgabe zählt nur übernommene Cookies.
- Prüfung: `playwright-host.test.ts -t "imported cookies"` grün, Lint, Format und Typecheck im Commit-Hook grün.
- Release `~/.local/share/pandaos-releases/cd7b2153e-google-login`: Kopie von `dcfa10307-stream-fit` plus nur dieser Commit, Build Queue #1706 grün (`.dev/google-login/`). Nur der Server hat sich geändert, die Web-UI ist unverändert.
- Grenze: Google braucht einmal einen direkten Login im Host-Browser (Passwort und 2FA). Autofill füllt das gespeicherte Passwort nur nach einem eigenen Klick ins Passwortfeld.
- 18:34 Geplanter Neustart auf `cd7b2153e-google-login` gesund: Dienst aktiv, `pandaos-live` zeigt auf den Release, `dist` enthält den Filter, Chromium 1208 vorhanden, Host-Browser startet und kennt das Konto in der Kontoauswahl (abgemeldet bis zum direkten Login).

## Eigentliche Ursache: Profil-Abgleich (19:10)

- Rückmeldung Marushan: Auch Outlook meldet ständig ab.
- Befund: Um 19:01 waren alle 1358 Cookies im Host-Profil neu gesetzt, ohne Import. Der Profil-Abgleich (`packages/app/src/desktop/browser/profile-sync.ts`, seit `ac6fe03a1-profile-hub`) kopiert jede Minute und nach jedem Daemon-Neustart alle Cookies zwischen dem lokalen Mac-Browser und dem Host-Browser in beide Richtungen, auch Löschungen. Google und Microsoft sehen dieselbe Sitzung auf zwei Geräten und widerrufen sie.
- Fix `e0aa8362f`: Abgleich und Import lassen Cookies von Google, YouTube, Microsoft-Login, Live, Office, Outlook und SharePoint aus. Jeder Browser behält dort seine eigene Anmeldung, alle anderen Seiten gleichen sich weiter ab. Nur Server, die Mac-App bleibt unverändert.
- Prüfung: Tests `profile sync` und `imported cookies` grün, Commit-Hook grün. Release `e0aa8362f-sign-in-sync`, Build Queue #1716 grün.
- Folge: Google und Outlook brauchen je einmal eine direkte Anmeldung im Host-Browser. Der lokale Mac-Browser löscht beim ersten Abgleich nach dem Update seine bisher gespiegelten Google- und Microsoft-Cookies einmalig und braucht dort ebenfalls eine eigene Anmeldung, falls er genutzt wird.
- 19:17 Geplanter Neustart auf `e0aa8362f-sign-in-sync` gesund: Dienst aktiv, `pandaos-live` zeigt auf den Release, `dist` enthält den Filter, Chromium 1208 vorhanden, Host-Browser läuft. Bis 19:18 hat niemand Google- oder Microsoft-Cookies ins Host-Profil geschrieben (0 von 1374 neu). Ob ein Abgleich-Lauf in dieser Zeit schon stattfand, ist nicht belegt.
