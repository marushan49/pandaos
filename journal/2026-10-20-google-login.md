# Google meldet den Host-Browser ab (20.10.)

- Rückmeldung Marushan: Im Host-Browser muss er sich ständig neu bei Google anmelden (Play Console).
- Befund: Alle Google-Cookies im Live-Profil `~/.pandaos/browser-profiles/shared/default` stammen aus dem Cookie-Import vom Mac (18:03). Um 18:22 fehlten `SID` und `__Secure-1PSID`, nur `ACCOUNT_CHOOSER` und `__Host-GAPS` waren übrig, also „Signed out“. Google widerruft Konto-Cookies, die von einem anderen Gerät kopiert wurden. Das Profil und der Schlüsselbund (`gnome-keyring` seit 10.10.) sind stabil, alle 1361 Cookies sind lesbar (`v11`).
- Zweiter Fehler: Jeder spätere Import spielte den ganzen gespeicherten Bestand neu ein, auch alte Google-Cookies. Ein direkter Login im Host-Browser wurde so wieder überschrieben.
- Fix `cd7b2153e`: Der Import lässt `google.com` und `*.google.com` aus, auch beim erneuten Einspielen des gespeicherten Bestands. Die Rückgabe zählt nur übernommene Cookies.
- Prüfung: `playwright-host.test.ts -t "imported cookies"` grün, Lint, Format und Typecheck im Commit-Hook grün.
- Release `~/.local/share/pandaos-releases/cd7b2153e-google-login`: Kopie von `dcfa10307-stream-fit` plus nur dieser Commit, Build Queue #1706 grün (`.dev/google-login/`). Nur der Server hat sich geändert, die Web-UI ist unverändert.
- Grenze: Google braucht einmal einen direkten Login im Host-Browser (Passwort und 2FA). Autofill füllt das gespeicherte Passwort nur nach einem eigenen Klick ins Passwortfeld.
- 18:34 Geplanter Neustart auf `cd7b2153e-google-login` gesund: Dienst aktiv, `pandaos-live` zeigt auf den Release, `dist` enthält den Filter, Chromium 1208 vorhanden, Host-Browser startet und kennt das Konto in der Kontoauswahl (abgemeldet bis zum direkten Login).
