# Skill Deck

## Auftrag und Abnahme

Aktien-Plugin entfernen. Ein eigenes Plugin bündelt Plugins und Skills je Host, globale und projektspezifische Quellen, Update-Prüfung, belegbare Überschneidungen und beobachtete Nutzung nach Provider. Fertig mit laufendem Plugin, echtem Browserlauf und angesehenen Desktop-/Mobilbildern. Native Geräte werden gesondert ausgewiesen.

## Ausgangspunkt

Verifiziert: `gdelt-tracker` läuft als Verzeichnisplugin. Plugin-Screens besitzen bereits Hostwahl und getrennten RPC-/Query-Kontext. Globale Skills liegen teils als gemeinsame Symlinks vor. Die vorhandene Plugin-CLI kann Updates mit `update --all --check --json` prüfen.

## Entscheidungen

- Eigenes Plugin `skill-deck`, keine Core-Änderung. Bestehende Einstellungen bleiben erreichbar.
- Retro-Modulbibliothek für Marushans Agentenwerkzeuge. ENERGY 2 / RHYTHM 2 / MOTION 1. Kantige Flächen und nummerierte Slots greifen den gewünschten Gaming-Stil auf; keine Animation ohne Aufgabe.
- Themefarben erhalten Lesbarkeit in hell/dunkel. Typografie des Hosts für Beschreibungen; kurze Slotnummern setzen den Retro-Akzent. Auswahl links, Inhalt rechts; mobil öffnet ein Modul separat mit Zurück-Aktion.
- Quellen lesen und Updates prüfen, nichts automatisch installieren. Identische Symlinks zusammenführen. Mögliche Konflikte als Hinweise mit Fundstelle zeigen.
- Nur beobachtete Nutzung zählen, keine vollständige Provider-Telemetrie behaupten.

## Checkpoint

Client implementiert. Aktien-Plugin über CLI entfernt und Abwesenheit rückgelesen; Quellen pfadgebunden mit Git entfernt. Historische Journale bleiben erhalten. Backend-Agent `5c72923d-3aa6-4871-a1af-79bb0e290da1` besitzt Inventar/Updates/Nutzung, `shared/contracts.ts`, `index.server.ts`. Hauptagent besitzt Client, Paket und `server/plugins.ts` / `shared/plugins.ts`. Fremde Workspace-Move-Änderungen und Projektjournal bleiben erhalten.

Backend meldete fünf fokussierte Dateisystemtests grün. Typprüfung läuft in Queue-Job `955a17be8d4f4a62999f466a342c1cb0` (Exec-Session 86803). Clientformat/Lint Job `27d6439f1d054774bdfb2868b07f2ee3` (Session 10741). Host-Verbindung im Browser bestätigt, Lauf `evr_51c4df57-49be-47e1-9024-73b6db4c5610`, eine bestehende Console-Fehlermeldung; neue Pluginfunktion noch ungeprüft.

Plugin auf dem aktiven Zotac-Host installiert, CLI meldet `running`. Kein Daemonneustart. Backend-Typecheck, Lint und acht Dateisystem-/Update-/Usage-Tests bestanden (Backend-Checkpoint). Zwei echte GitHub-Dateivergleiche stimmen mit ihren lokalen Skill-Dateien überein.

Erste Funktionsprüfung: Suche antislop, Skill-Quelle/Inhalt, Plugins, read-only Plugin-Updates, Hinweise und Nutzungsansicht ausgeführt. Der automatisierte Lauf `evr_d10ea895-e123-4e96-bfee-d8ef64b760a0` stoppte am nicht eindeutigen CSS-Locator für Info; Übernahme per Snapshot und DOM-Klick öffnete die Info erfolgreich. Eindeutige Test-IDs für Pluginbuttons und Suche ergänzt. Null Console-Errors/fehlgeschlagene Requests in diesem Lauf.

Sichtprüfung angesehen: Desktop 1280x720 hell, Bibliothek (`evr_1fe9d6cf-6736-4352-987b-129a5c5dbbf8/screenshot.png`), Nutzung leer (`evr_4339d0c3-fc03-41d0-9a3f-faa5b19a2e24/screenshot.png`), Info (`evr_3b804e9d-1452-4866-abfd-e3bfc013b74c/screenshot.png`), kompakte Bibliothek 390x844 (`evr_566c5d26-ad3d-4d2d-a16b-edeb5b567e0a/screenshot.png`). Basis jeweils `/home/admin/.pandaos/artifacts/wks_87cf2bbf78a1437f/`. Keine Überlagerung/abgeschnittene Bedienelemente gesehen. Finalscreenshot nach Clientrefaktor noch offen.

## Abschluss und Delivery Gate

Umsetzung auf diesem Host abgeschlossen. Aktien-Plugin fehlt im Live-Katalog; Skill Deck läuft nach Reload. Quellen liegen unter `skill-deck/`. Kein Commit, Push, Geräte-Rollout oder Daemonneustart. Fremde Änderungen im gemeinsamen Checkout erhalten.

- Funktion PASS: kompakter Skill öffnen/kopieren/zurück/Info (`evr_d9e10745-1a54-411a-9506-667dd0a352a4`); echte GitHub-Skill-Inhalte, read-only Plugin-Updates und alle vier Tabs (`evr_c5b3fc3c-a880-4048-84e3-c67629121f8a`). Projektwahl auf `/home/admin/projects/pandaos`, Bereich Projekt, zeigt nur `release-beta`/`release-stable` (`evr_44683cda-1591-46ac-8d4e-90169630fc0b/screenshot-project-only-skills.png`). Ein früher Goal-Lauf prüfte zu früh; der tatsächliche Bereich wurde danach selbst gewählt und am Bild bestätigt. Keine vollständige Abnahme aus diesem früheren Goal behauptet.
- Nutzung PASS: echter Claude-Read von `paseo-plugin/SKILL.md` nach Aktivierung ergibt genau einen gespeicherten Datensatz mit Provider `claude`, Count 1 und dem SHA256 des realen Dateipfads. Im UI bestätigt und Bild angesehen: `evr_9770637b-3653-44d0-b9c2-7bef005bf765/screenshot-observed-claude-usage.png`. Der Live-Test fand eine fehlende Zuordnung projizierter Agentennachrichten; exakt anhand `paseo-agent-message:<acceptedId>` behoben. Erste Turnmarker bleiben erhalten, Namespace braucht Pfadbeleg, keine Writes ohne neue Aufrufe.
- Code PASS: letzter Backendlauf Queue36 `d5c14ca961e24b9eac3c9065f6153c93`: 10 gezielte Tests, Lint, vollständiger Plugin-Typecheck grün. Letzte UI-Prüfung Queue38 `6806fda30f2547c5b31c69a66dc49008`: Format, Lint und Plugin-Typecheck grün. Keine erklärenden Code-Kommentare. Spätere unveränderte Textlabel-/Style-Verwendung braucht keine neue breite Suite.
- Sicht PASS für geprüfte Browseransichten: 1280x800 hell/dunkel, 390x844 hell/dunkel, Bibliothek/Details/Hinweise/Nutzung/Info/Projektfilter. Bilder tatsächlich angesehen. Finale Desktopansicht und leerer Suchtreffer: `evr_19e2cd2a-d42d-4bd8-af51-b3930f12950d/screenshot-desktop-light-final.png`. Finale kompakte Ansicht: `evr_7bc384f3-122d-4e23-9e68-d5071012cb4a/screenshot.png`. Alle genannten erfolgreichen Funktionsläufe ohne Console-Errors und fehlgeschlagene Requests.
- Zugänglichkeit für geprüften Umfang PASS: Tab erreicht Projektfilter, Enter öffnet den Dialog (DOM bestätigt), Escape schließt ihn. Textfarben der tatsächlich sichtbaren Paare gemessen, Minimum hell 4,93:1 und dunkel 6,64:1. 200% Textgröße im Browser simuliert: nach eigener Titelanordnung und Icon-Aktionen kein horizontaler Überlauf, Titel und erster Listeneintrag sichtbar; finales Bild `evr_17eeef23-d61b-4b78-aeef-30a95f55c901/screenshot.png`. Browser-Simulation ersetzt keine native Systemschriftprüfung. Ursprüngliches Theme `System` und Textgrößen wiederhergestellt.

Purpose-/Liveliness-Gate PASS im beauftragten Umfang: ENERGY 2 / RHYTHM 2 / MOTION 1, nummerierte kantige Module als Retro-Motiv, Themefarben statt eigener Palette, unverwechselbare Pfade/echte Daten statt erfundener Metriken. Info und Neuladen als bekannte Symbole, um die Bibliothek bei großer Schrift erreichbar zu halten. Keine Endlosschleifen, Dekobilder, unbestellten Funktionen, automatischen Updates oder Veröffentlichungen.

Grenzen explizit: bekannte Providerverzeichnisse und Caches, keine garantierte aktive Bereitstellung; Scan-Tiefengrenze im Claude-Cache wird sichtbar angezeigt. Lokaler Unterschied zum Upstream kann eine eigene Anpassung sein. Semantische Widersprüche und vollständige Nutzung sind nicht bewiesen. Native Android/iOS/Mac-App, anderer Host, Screenreader, echte OS-Textskalierung und künstlich erzeugte Offline-/Berechtigungsfehler ungeprüft. Werbung/SEO/Testimonials/Preis-/Kaufabläufe nicht anwendbar. Browser-Tab und Agenten bleiben offen; Heartbeat wird nach finalem Readback gelöscht.
