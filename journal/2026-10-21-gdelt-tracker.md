# GDELT Aktien-Tracker

## Auftrag und Fertig-Kriterien

Eigenständiges lokales Plugin für Nachrichten zu eigenen Positionen, beobachteten Aktien und weiteren Themen. Fertig: Watchlist erstellen, bearbeiten und entfernen, dauerhaft speichern, GDELT-Meldungen mit Originalquellen abrufen und den Kontext gezielt einem Agenten übergeben. Agenten können die Liste über denselben validierten lokalen CLI-Zugang pflegen. Keine Kursdaten, Handelsaktionen, automatische Käufe oder ungefragten Zeitpläne.

## Befunde und Entscheidungen

- Verifiziert: Plugin-API unterstützt Workspace-Panels, Sidebar, RPCs, Slash-Befehle und Composer-Anhänge. Externe Plugins sind bereits aktiviert. Quelle: docs/plugins.md, public-docs/plugins/reference.md und laufendes `pandaos plugin ls`.
- Verifiziert: GDELT DOC unterstützt ArtList/JSON, englische Suchausdrücke, DateDesc und bis 250 Artikel. Quelle: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/ . Artikelansicht bewusst auf maximal drei Monate begrenzt. Erreichbarkeit noch ungeprüft.
- Kleinste Umsetzung: eigenständiges `gdelt-tracker/`, keine Änderungen am Core, keine neue Abhängigkeit. Host-lokale Daten, keine Speicherung von Positionen im Second Brain oder Repo.
- Design Read: Recherchepanel für Marushan, vorhandene PandaOS-Tokens und Formularbausteine, ENERGY 1 / RHYTHM 1 / MOTION 1. Ruhige Listen priorisieren Quellen; Akzent nur für die wichtigste Aktion. Newspaper-Symbol kennzeichnet Nachrichten, keine Kursentwicklung.
- Kein bestehender Peer besitzt diese neue Plugin-Einheit. Keine laufenden Builds dieser Aufgabe.

## Checkpoint

Plugin installiert und laufend. Queue1819: Typecheck/Lint/Format, drei gezielte Tests und Installation bestanden. Queue1829: nach bereinigten RPC-Fehlertexten und Schutz vor Wiederherstellen zwischenzeitlich entfernter Einträge erneut bestanden, Plugin erfolgreich neu geladen. Frühere fehlgeschlagene Type-/Lint-Läufe behoben; Queue1827 wurde vor Start bewusst abgebrochen.

Abgeschlossen: Queue1834 und1837 bestanden, aktueller Quellstand kompiliert und Plugin neu geladen. Mobile Bedienelemente verwenden mindestens44Pixel, sichtbaren Fokus und Theme-Tokens. Keine neuen Abhängigkeiten, kein Core-Eingriff, kein Daemon-Neustart, kein Commit/Push. Browser1792568994950-bf3e38b63a86da3e und Advisor f40dab62-63bf-445b-a41c-9dd4a3492a48 bleiben offen. Heartbeat620ced46 entfernt, keine eigenen Hintergrundjobs mehr.

## Verifikation

- Verifiziert: Anlegen mit Leerfeldvalidierung, Bearbeiten, Zuordnung Beobachten, Neuladen und Entfernen über die echte laufende App. Browserbelege evr_61632fbf-58a5-441c-a07b-cf4d907d9c98, evr_0ac41e0b-ec8d-4222-82d1-6f3b03bd4811 und evr_72ccb757-6ebf-4c2b-a53c-1519d04a1295. Kein Consolefehler. UI-Testnavigation brauchte wegen nicht gefundenen Menü-/Tab-Selektoren manuelle Übernahme; anschließend geskriptete Rezepte bestanden.
- Verifiziert: `/aktien` übergibt die tatsächliche Watchlist und den Auftrag an den ausgewählten Agenten. Advisor antwortete wörtlich `GDELT-KONTEXT-OK GDELT-Prüfeintrag geprüft`; Browserbeleg evr_b8fec27c-6303-4b81-9e6d-4259b49b656d. Keine Tools oder Änderungen durch diese Prüfnachricht.
- Verifiziert: dauerhafte Datei in `~/.pandaos/plugin-settings/gdelt-tracker/data/`, Dateirechte0600, atomarer Austausch, Konfliktablehnung, Schutz beschädigter Daten und CLI-CRUD. Alle temporären Testeinträge über UI entfernt, danach 0 Einträge rückgelesen; final Revision6 und keine Lockdateien bestätigt. Keine echten Positionen angenommen oder gespeichert.
- Verifiziert: GDELT antwortete auf echte Suchen mit HTTP429, auch im Plugin. Sichtbare Fehlermeldung korrekt. Erfolgreiche Live-Nachrichtenliste und Öffnen einer echten Artikelquelle bleiben unbestätigt. Parser, URL-Prüfung, Deduplizierung, Rate-/Syntax-/Formatfehler mit ausdrücklich synthetischen Testantworten geprüft.
- Verifiziert: kompakte Webansicht390×844 ohne horizontalen Überlauf. Standard-SDK-Buttons waren32Pixel hoch; Plugin-Aktionen und Auswahlbuttons messen nun44Pixel. Finales Rezept `gdelt-mobile-controls-create-remove` bestanden, Beleg evr_9b259d03-3fcf-42f9-aed6-bdaceee55060. Zugehörige Screenshots unter `/home/admin/.pandaos/artifacts/wks_f1b031970c84b98f/`. Finale Testeinträge erneut entfernt. Native Android/iOS und dunkles Theme ungeprüft.

## Delivery Gate

- Funktion/Datenerhalt: PASS für geprüfte Watchlist-CRUD-, CLI-, Agentenübergabe- und Fehlerpfade; Belege oben. Live-Erfolgsantwort GDELT ausdrücklich unbestätigt, keine Artikel erfunden.
- Zweck/Identität: PASS im beauftragten Umfang. Bestehende PandaOS-Formularzeilen, Typografie und Theme-Farben; gezielte44Pixel-Ausnahme, da SDK-Aktionen diese Größe nicht anbieten. Keine dekorativen Bilder, Zahlen, Effekte oder fremde Gestaltung. Dials1/1/1.
- Mobile/Kontrast: PASS für390Pixel-Webansicht. Gemessene Buttonhöhe44Pixel, Dokumentbreite390Pixel. Text `#15140f` auf `#f7f6f1`:17,04:1; Sekundärtext/Rand `#6a665c`:5,29:1, mit installiertem Kontrastprüfer berechnet. Fokus ist als dunkler Rand sichtbar; Tab-Erreichbarkeit im echten Browser geprüft.
- Quellen/Code: PASS für keine erfundenen Positionen, Empty/Loading/Error, keine DOM-Abhängigkeit im Plugin, keine erklärenden Codekommentare, keine neuen Abhängigkeiten und gezielte Freigabe der Watchlist an einen Agenten. Unzutreffend: Marketingzahlen, Testimonials, Landingpage-Navigation, Medienassets und Animationen.
- Ungeprüft: native Geräte, dunkles Theme, vollständiger Tastaturablauf einschließlich Escape auf dem kompakten Host-Sheet, erfolgreicher Live-Artikelabruf und Klick auf eine echte GDELT-Quelle. Keine plattformübergreifende Freigabe behauptet. Verbleibende bekannte Grenze: verwaiste Schreibsperre nach hartem Prozessabbruch erfordert Prüfung und gezieltes Entfernen der `.lock`-Datei; OVERVIEW.md beschreibt dies. Keine unsichere automatische Lock-Übernahme eingeführt.

## Runde 2: Sidebar-Button, neues Layout, Screenshot-Import

- Auftrag: weniger hässlich, Button oben, Depot-Screenshots (Trade Republic usw.) automatisch eintragen.
- Umgesetzt: `addScreen` + `addSidebarHeaderItem` „Aktien“ oben in der Sidebar; Layout zweispaltig (Liste nach Positionen/Beobachten/Themen links, Suche, Zeitraum-Chips und Meldungen rechts); Formular im Modal hinter **Hinzufügen**; Klick auf Eintrag lädt Meldungen. Screenshot-Import über `agent.create`-Systemprompt mit CLI-Aufruf; nur Namen, keine Beträge.
- Verifiziert: Typecheck, Format, Lint bestanden (Queue #1852 ff.); Plugin neu geladen, läuft. Echter Browser: Sidebar-Button öffnet Seite, Eintrag sichtbar und auswählbar, Fehlermeldung bei GDELT sichtbar, 0 Consolefehler. Screenshot evr_a537ff7f-1dd9-4fdb-8cf4-e321e280a183.
- GDELT: direktes curl vom Host liefert HTTP 429 nach 11 s; Host-IP wird gedrosselt. Live-Treffer weiter unbestätigt.
- Verifiziert: Screenshot-Import. Neuer Agent (b211ff1d) bekam nur Bildpfad und „Depot eintragen“, las synthetisches Depotbild und legte Siemens Energy, ASML Holding, Rheinmetall als Eigene Position an; keine Beträge in der Datei. In der App sichtbar (evr_82002eb4-164a-4dac-95db-c74595dca1b2). Alle Testeinträge und das Testbild danach entfernt, 0 Einträge rückgelesen.
- Ungeprüft: echter Trade-Republic-Screenshot, Drag-and-drop in den Chat, native Geräte, dunkles Theme. Laufende Agenten ohne Hook brauchen den Watchlist-Anhang.

## Runde 3: Alert-Feed im Plugin (Neuausrichtung)

- Auftrag: Alert-Feed statt Suchseite, alles im Plugin, kein Agentenchat. GDELT-Warteschlange (1 Anfrage/6 s, Backoff 30/60 s), Poller alle 15 min, Cache, Dedup nach Story, Finnhub, KI-Bewertung je Meldung, Telegram bei Stärke mittel/hoch, Drop-Zone für Depot-Screenshots, Detail mit „Frag nach“.
- API-Prüfung: Kein direkter LLM-Aufruf für Plugins vorhanden; der Kern hatte `generateStructuredAgentResponseWithFallback` (ohne Workspace, interne Session, Haiku zuerst). Neu: `server.generate({ prompt, schema, images })` über den internen Plugin-Kanal (`generate.request`/`generate.result`), keine Änderung am App-Protokoll. Kein Plugin-Push vorhanden, daher Telegram plus Toast in der offenen App. Drop-Zone neu als `ImageDropZone` (nutzt FileDropZone und Bildauswahl der App). Ausgehende IP: eigener Telekom-Anschluss, nicht geteilt; 429 kommt von GDELT selbst.
- Entfernt: `/aktien`, `/watchlist`, Anhangquelle, `agent.create`-Hook, Briefing und CLI.
- Verifiziert: Server-Build, Server- und App-Typecheck grün; Runtime-Test „host model call“ 1/1; Plugin-Tests 3/3 (Warteschlange und Backoff, Story-Dedup, Poller mit Relevanzfilter). Lint 0 Fehler. Auf dem alten Host lädt das Plugin, Feed und Einstellungsmodal sichtbar (evr_55162e62-ad39-4523-ae3f-4079c45248a8), Hinweis „Host-Update nötig“ korrekt.
- Release: `~/.local/share/pandaos-releases/aktien-alerts` = Kopie von `browser-where-you-are` plus nur die Kern-/SDK-/App-Dateien dieser Aufgabe (bootstrap als Patch). Skript `.dev/aktien-alerts/build-release.sh`, Log `.dev/aktien-alerts/build.log`. Aktivierung nur nach Freigabe per `pandaos-planned-restart --release`.
- Release-Build Queue #1932 grün (Server und Web-UI, generate und ImageDropZone im Bundle nachgewiesen), Dry-Run des Neustarts ausgeführt.
- Neustart-Freigabe von Marushan am 21.10.2026 erteilt, geplanter Neustart mit --release aktien-alerts gestartet.
- Offen: Finnhub-Key, Telegram-Token/Chat-ID und echter Trade-Republic-Screenshot von Marushan; dann 13 Positionen anlegen, Live-Lauf prüfen, pfadgebunden committen.
- Rollout aktiv: Neustart 2026-10-21T10-45-41-674Z gesund (Dienst aktiv, Live-Link auf aktien-alerts, Plugin running, Sessions fortgesetzt).
- Gefunden und behoben: `z.toJSONSchema` setzt `$schema` draft 2020-12, das der Daemon-Validator nicht kennt; Plugin entfernt das Feld jetzt, Test prüft es. Veralteter KI-Status wird bei verfügbarem Host geleert. Einstellungen müssen in `Modal.Content` liegen.
- Verifiziert (Funktion): `server.generate` mit Bild auf dem echten Host. Synthetisches Depotbild per Drop auf die Drop-Zone gelesen: Nvidia als Aktie mit NVDA, Brent 3x als ETF/ETP mit Hebel 3 und Themen Hormuz/OPEC/Iran/oil tanker/Brent crude, Gold ETC mit Fed/Zinsen/Goldpreis, MSCI World mit global stocks/Fed/recession. GDELT lieferte einmal Treffer, danach 429 mit sauberem Statustext.
- Verifiziert (Sicht, Desktop 1280x720, Standardschrift, helles Theme): Feed-Leerzustand, Einstellungsmodal, Import-Vorschau (evr_11c91c12-0676-40dc-a88e-c554f5bb99f1). Ungeprüft: Alert-Karten und Detail mit echten Daten, kompakte Breite, dunkles Theme, native Geräte, Telegram-Versand, Finnhub.
- Testeintrag „TEST Nvidia“, Import-Vorschau und Testbilder entfernt; 0 Einträge, 0 Alerts rückgelesen.
