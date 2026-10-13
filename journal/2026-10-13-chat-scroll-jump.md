# Chat springt beim Lesen älterer Nachrichten nach oben (2026-10-13)

## Befund

Mac-Desktop-App, beim Lesen älterer Nachrichten springt der Chat wiederholt nach oben. Nachgestellt im headless Chromium gegen den Zotac-Daemon (Chat `ags-schaden`, Agent `e600dd97`) mit Sprung über die Chat-Gliederung und trackpadartigem Hochscrollen bei 60 fps: in 3 von 3 Läufen schrumpfte der Verlauf von rund 93 000 auf 3 165 px, scrollTop stand auf 0, danach lud der Verlauf ohne Lesepunkt-Korrektur bis zur ersten Nachricht nach.

## Ursache

`useStreamHistoryWindow` merkt sich die erste sichtbare Zeile als Fenstergrenze. Beim Zusammenführen älterer Seiten wird diese Grenzzeile neu erzeugt (andere ID). Die Grenze war dann nicht mehr auffindbar, das Fenster fiel im selben Render auf die letzten ~20 Einträge zurück. Der Browser klemmte scrollTop auf 0, der Lesepunkt verlor seine Zeile und jede weitere Seite wurde unkorrigiert oben eingefügt.

## Entscheidung

Verschwindet nur die Grenzzeile, übernimmt die nächste noch vorhandene Zeile des bisherigen Fensters (auf den Beginn ihres Turns ausgerichtet) die Grenze, noch vor dem Commit. Nur wenn keine Zeile des alten Fensters überlebt (ganze Timeline ersetzt), startet das Fenster wie bisher bei den neuesten Einträgen.

## Belege

- Unit-Test `use-stream-history-window.test.tsx` 7/7, neuer Fall für die ersetzte Grenzzeile.
- Lint und Format der Dateien sauber, App-Typecheck ohne Fehler (Queue #620), Web-Export #621.
- Gleicher Headless-Lauf mit dem neuen Bundle: kein Zusammenklappen, Lesepunkt bleibt stehen; Lauf ohne Gliederungssprung ohne Verschiebung.
