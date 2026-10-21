# Aktien-Alerts

Feed mit bewerteten Nachrichten zu deinen Positionen. Öffne **Aktien** oben in der Sidebar. Oben steht die Positionsleiste mit Tagesstatus (grün, rot, grau), ein Klick filtert. Links der Feed mit Alert-Karten, rechts das Detail mit Einordnung, Zeitstrahl, Quelle, verwandten Meldungen und **Frag nach**.

**Positionen** öffnet die Einstellungen. Zieh einen Depot-Screenshot (Trade Republic oder andere) in die Fläche oder tippe darauf. Das Plugin liest nur Namen aus, schlägt Suchbegriffe vor (Einzelaktie: Name und Ticker, ETF/ETP: Themen des Basiswerts) und speichert erst nach deiner Bestätigung. Einträge lassen sich dort auch von Hand anlegen und ändern.

Der Hintergrundabruf prüft jede Position alle 15 Minuten. GDELT läuft über eine globale Warteschlange mit höchstens einer Anfrage alle 6 Sekunden; bei HTTP 429 wartet sie 30, dann 60 Sekunden und meldet den Fehler in der Statuszeile. Mit Finnhub-Key kommen für US-Ticker `company-news` und Kurse dazu. Meldungen werden nach URL und Schlagzeilenähnlichkeit je Position dedupliziert. Jede neue Meldung bekommt einen Modellaufruf über `server.generate` (Richtung mit Hebel, Stärke, Kernaussage, eingepreist); höchstens 20 pro Durchlauf, irrelevante Treffer fallen weg.

Telegram: Bot bei @BotFather anlegen, Token und deine Chat-ID speichern, **Telegram testen**. Push kommt nur bei Stärke mittel oder hoch. Bei offener Seite zeigt PandaOS zusätzlich einen Hinweis.

Daten liegen mit Dateirechten 0600 im Plugin-Datenverzeichnis des Hosts: `watchlist.json`, `feed.json` (Alerts, gesehene URLs, Kurse, Status) und `config.json` (Keys). Keys werden nie an die Oberfläche zurückgegeben. Kursänderung bezieht sich auf den Eingang der Meldung, nicht auf die Veröffentlichung; Finnhub liefert im Gratistarif nur US-Kurse. Keine Handelsaktionen, keine Kursprognose.

Tests: `node --experimental-strip-types --test server/tracker.test.ts`.
