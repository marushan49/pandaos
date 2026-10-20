# Jev Ultrafast im eingebauten Browser

Status: Code und Prüfungen abgeschlossen. Produktive Aktivierung wartet auf ausdrückliche Neustartfreigabe.

## Ziel und Fertig-Kriterien

Marushan beauftragt die Einbettung des Open-Source-Projekts browser-use/jev-ultrafast in PandaOS' eingebauten Browser. Jev bleibt Entscheidungsmodell. Fertig: lizenzierter Upstream-Code tatsächlich im Browserpfad, dynamischer Aktionsraum mit aktuellem Feldzustand und Dropdowns, lokale geheime Werte erhalten, öffentlicher Text aus dem aufrufenden Coding-Agent, fokussierte Prüfungen und echter Jev-Browserlauf gegen gebauten Kandidaten.

## Befunde und Entscheidung

Verifiziert: Upstream 1231850a0bf1a0c0341fe408ef1668dbbfdfac46 (GitHub API, 20.10.2026), MIT. snapshot.js erfasst sichtbare Elemente/Optionen und bewahrt DOM-Identität sowie semantische Guards. model.py bündelt Aktions- und kompatible Zielentscheidungen in einem Request. PandaOS bündelt bereits Entscheidungen, sieht bisher aber keine Feldzustände, keine nativen Dropdownoptionen und akzeptiert im öffentlichen Tool nur env-Werte. Native Integration bewahrt Profil, Broker, Handoffs, sichtbare Schrittleiste und plattformübergreifende Clients. Kein Python-Zweitbrowser und kein zusätzlicher Modellschlüssel: der aufrufende Coding-Agent liefert öffentliche Feldtexte; geheime Werte bleiben env-Slots.

Hypothese: kompaktere beobachtete Ziele und sinnvolle Aktionsauswahl sparen unnötige Modellentscheidungen. Kein allgemeiner Geschwindigkeitsgewinn ohne Messung behaupten.

## Scope

Browser-Host-Snapshot, lizenzierter Ultrafast-DOM-Reader/Guards, vorhandener Jev-Runner, Tool-Wertschema, Dokumentation und vorhandene gezielte Tests. Keine UI-Änderung. Additive Protokollfelder für interne Jev-Snapshots und öffentliche Rezept-Textwerte. Fremde lokale Änderungen erhalten. Implementierung und geprüfter Endstand stehen unten; Hauptdaemon unverändert, kein Neustart autorisiert.

## Prüfen

Gebauten Server einmal prüfen; gezielte Tests für Auswahl gültiger Operationen/Targets, Dropdowns, Geheimnisredaktion und veraltete DOM-Identität. browser_test zuerst (Rezeptliste gelesen). Echten Jev-Lauf mit ausgewähltem Filter und lokalem Text und Screenshot sichern. Typecheck/Lint einmal gezielt. Installation auf Mac/Android nicht beauftragt.

## Implementierung Stand 1

Ultrafast-Reader als lizenzierter Quelltext eingebettet; Host-Snapshot mit Zuständen und hostlokalen Identitäts-/Formguards, Jev-SELECT und globalen Elementindizes, öffentliche text-Slots und unveränderte env-Slots. Protokolländerung ist additive Rezept-Wertunion (bestehende env-Form unverändert). Fokussierte Regressionen und realer Lauf noch offen. Kein Lifecycle-Statuspfad injiziert; eigener Second-Brain-Fallback angelegt.

## Verifizierter Endstand

- Upstream-DOM-Reader und Regeln sind MIT-lizenziert eingebettet, einschließlich Lizenztext im kompilierten JavaScript. Eigene Textgenerierung übernimmt der aufrufende Coding-Agent über öffentliche `text`-Slots; `env`-Slots für Geheimnisse bleiben lokal. Kein weiterer Text-Modellschlüssel erforderlich.
- Ausschließlich Jev-Snapshots setzen das optionale `forGoal`. Normale Snapshots behalten die bisherige Erfassung. Snapshot-Referenzen sind jetzt pro Tab fortlaufend eindeutig und werden durch exakten Ref-Vergleich aufgelöst. Ein anderer Snapshot kann alte Jev-Referenzen nicht umdeuten. Fehlgeschlagene Stale-Versuche dürfen nach erneuter Beobachtung neu entschieden werden.
- Review durch Sonnet-Advisor `c8d5d4d8-d6d5-41d6-8a7a-e91776bad953`: generische Snapshot-/Mehrfach-Fill-Regression, Selektoridentität, Passwortdarstellung und aktuelle Select-Zustände korrigiert. Danach Stale-Retry und konkurrierende Snapshots korrigiert; gezielte Regressionen grün.
- Serverstack-Build erfolgreich, nach den letzten Source-Fixes nur Server neu gebaut. Letzter Buildjob `9e1f1940cc84486497e6ffc2d0c17c61` (#1555). Typecheck des Server-Workspaces erfolgreich, gezielter Lint 0 Fehler/0 Warnungen (#1558). Logs unter `.dev/jev-ultrafast/`.
- 54 Tooltests, 12 Runner-Tests und zwei gezielte native Hosttests bestanden. Der echte TypeSafe-E2E-Fixturelauf bestand bei unveränderter Mindestkonfidenz 0.5 mit FILL, SELECT, CLICK. Die vorherige niedrige SELECT-Konfidenz wurde durch die an Upstream angeglichene Feld-/Optionsdarstellung behoben; keine Schwelle gesenkt.

### Echter gebauter Kandidat

`browser_test` ist bestanden: Run `evr_8a537256-b616-4a93-a1a9-d31ef49e1e3f`, Evidence `evidence://wks_34312ef1da47f371/evr_8a537256-b616-4a93-a1a9-d31ef49e1e3f`. Es klickt die lokale Prüffläche, die den tatsächlich gebauten Jev-Runner und Browser-Host mit eigenem Profil und echter TypeSafe-API ausführt. Ergebnis: drei Aktionen, Route `Vienna to Graz`, Klasse `First`, `Direct only` bleibt aktiviert; unabhängiger Ergebnistext stimmt. 0 Konsolenfehler und 0 fehlgeschlagene Requests. Screenshot `.dev/jev-ultrafast/candidate.png` persönlich angesehen; Ergebnis und Trace `.dev/jev-ultrafast/candidate-result.json`. Gespeichertes Rezept `jev-ultrafast-built-candidate` verwendet den Parameter `candidateUrl` für den jeweiligen Prüfharness.

Gemessene 1478 ms sind genau ein Fixturelauf, Beginn vor `runner.run` inklusive Tabvorbereitung, Ende nach dessen Ergebnis und finalem Screenshot. Kein Vorher-/Nachher-Benchmark und keine allgemeine Geschwindigkeitsbehauptung.

### Grenzen und Abschlussprüfung

Hauptdaemon unverändert. Kein Push, keine Veröffentlichung, kein Mac-/Android-Rollout. Produktive Aktivierung benötigt Marushans ausdrückliche Neustartfreigabe. Temporärer Kandidatenprozess und Queuejob #1559 sind beendet; Bild und Ergebnisse bleiben als Beleg erhalten. Der anfängliche kombinierte native Lauf überschritt beim Profil-/Login-Wiederherstellungstest das 15-Sekunden-Limit. Der gezielte Vergleich mit dem HEAD-Ausgangscode und anschließend mit der fertigen Implementierung bestand jeweils einzeln (2.79 s / 2.75 s Gesamt-Testlauf). Die Profil-/Login-Wiederherstellung ist damit im gezielten Lauf ebenfalls verifiziert; der breite native Testsatz wurde nicht ausgeführt. Logs legacy-baseline.log und legacy-final.log.

Anti-Slop Delivery Gate (lokale Anpassung, during): R-35/C-2 PASS durch Build, echte TypeSafe-Aktionen, native Stale-/Parallel-Snapshot-Prüfungen und browser_test; R-17/R-18/R-36/R-38/C-5 PASS, nur belegte Testergebnisse, kein erfundener Speedup oder Kundentext. R-31 PASS, native Integration bewahrt bestehenden Profil-/Handoff-/Aktivitätsfluss; kein zusätzlicher Browser-/Pythonprozess als Produktarchitektur. Code-Kommentarprüfung: Lizenz und Tool-Direktiven bleiben erhalten, keine neuen erklärenden Kommentare. Visuelles Design, Assets, Themes, Responsive Layout, Typografie und Accessibility-Redesign sind nicht anwendbar: keine Produktoberfläche geändert. Native Bedienung auf Mac/iOS/Android und breite CI sind ungeprüft, keine entsprechenden Behauptungen.

Abschluss: Auch der gezielte bisherige Login-/Profil-Wiederherstellungsablauf ist bestanden (#1561). Eigene temporäre Baseline-Quelldatei entfernt und Testimport zurückgelesen; keine zusätzlichen Browserdienste aktiv. Repoänderungen anderer Aufgaben bleiben unangetastet.

## Expanded autonomous mission

User explicitly authorized production rollout and controlled restarts. Previous permission-pending state is superseded. Baseline uses unchanged live release, whose source hashes are in `.dev/jev-ultrafast/baseline-manifest.json`. Plan: reproducible baseline, minimal adaptive routing/recovery, identical repeated benchmark, independent review, production build, planned restart, production active-provider E2E. Heartbeat `17149563` resumes bounded waiting phases.

### Autonomous mission checkpoint 01:53 UTC

Original immutable baseline: 35/40 passed; 8 scenarios ×5, p50 1039 ms, p95 1348 ms, 293 internal browser commands, 124014 input and 14786 output TypeSafe tokens. `.dev/jev-ultrafast/baseline-final/` contains raw rows, source hashes and conditions. The repeated matched A/B runs are separate artifacts. First adaptive optimization was rejected: removing singleton heads reduced joint-context reliability. The replacement restores normal heads, filters only executed actions into history, retries malformed decisions before any input, masks known OTP/payment fields, verifies already-satisfied and last-step goals, preserves active-agent takeover and labels ambiguous submission timeouts `execution_uncertain` (never auto-resubmit).

Final candidate verification is queued behind another authorized native Android compile. Queue #1586 `fbe47082363f48069d1d3b1b5923c5bb` (shell43966), then #1592 `2035fe1e18f14655b18fdb2fe14192d8` (shell42774). The latter stages an isolated release only if all40 candidate tasks pass and built module hashes match. Do not start duplicate jobs. Production is unchanged. Planned restart dry-run lists12 sessions. User deployment/restart authorization remains explicit. Heartbeat17149563 continues without user action; next at02:00 UTC, bounded8h.

TypeSafe responses provide token counts but no billed amount; upstream pinned performance report confirms that limitation. No dollar estimate or savings claim is asserted without a tariff.

### Checkpoint 02:38 UTC

Conditional value disambiguation passed19 focused tests and all40 controlled tasks, versus35/40 in the matched original arm. Same-run p50:1066→715 ms; p95:1481→1415 ms. Provider calls115→94; browser commands295→325 (more work completes and stale refs are explicitly rejected); input126372→137948 and output15065→11441. This is the accepted reliability comparison, not a cheaper-input claim. Compact model context now omits refs and timing/confidence history; preserves all offered target/value choices and field states. Compact A/B and20 focused tests are queued#1606, session85742.

A real public task on the old live daemon failed with TypeSafeHTTP422 (Wikipedia Alan Turing,400 snapshot nodes). The active Codex-business/GPT-6.1-Sol caller then took over the same tab, clicked the observed Turing machine link and independently verified URL plus mathematical-model text. Evidence: `.dev/jev-ultrafast/public-baseline.json`, screenshot `evidence://wks_34312ef1da47f371/evr_31fb5961-c54b-48e3-bd76-9803583f53e7/screenshot`. Browser tab1792463458138-87f4661762d7891a stays open.

Review corrections: only timeout/unknown dispatch errors are execution-uncertain; after them observe/verify before returning, never auto-resubmit. Conditional slot clarification now includes chosen field index/state and completed actions and preserves provider outage classification. Sensitive-name matching handles cardNumber/securityCode/customerSSN while keeping businessName public. Numeric refs get a per-runtime namespace so old refs cannot alias across host restore; native close/restore negative test added. Final native/typecheck/release staging and actual immutable-release public5xA-B are queued#1609, session53491. Both wait behind native Android build#1605. No production switch yet.

Bounded fixture service `pandaos-jev-fixture-2275.service` serves the non-destructive train form at `http://127.0.0.1:39093/`; RuntimeMaxSec7200, no browser process in that service. Keep until production verification and saved evidence; main daemon restart authorization remains explicit. Canonical checkpoint and heartbeat17149563 provide continuation.

## Finaler Vorher-/Nachher-Vergleich vor Aktivierung

Gemessener Stand: `compare-compact`,20Runner-Tests,54Tooltests,2nativeTestsinklFeldschutz/Overlay/Hostrestore,Typecheck undgezielterLint bestanden. Das unveränderteServer-Release wurde anschließend gegenWikipedia getestet (5/5; Original0/5HTTP422). Noch keineProduktivaktivierung.

| Metrik,40Aufgaben jeVariante | Vorher | Nachher |
| ---------------------------- | -----: | ------: |
| Erfolg                       |     35 |      40 |
| p50ms                        |   1026 |     626 |
| p95ms                        |   1473 |    1350 |
| InterneBrowserbefehle        |    295 |     324 |
| Provider-Aufrufe             |    115 |      89 |
| Input-Tokens                 | 127033 |  125201 |
| Output-Tokens                |  15210 |   11198 |
| Stale-Retries                |      0 |       5 |
| Handoffs                     |      5 |       0 |

Die35beidseitig erfolgreichen Läufe ergeben p50:935→817ms, p95:1531→1365ms. Die Gesamtwerte vergleichen dieselben gestartetenAufgaben und enthalten die fünf altenDropdown-Fehler. MehrBrowserbefehle entstehen durch zusätzlich abgeschlosseneDropdown-Aufgaben und überprüfteStale-Recovery. EinzelneMehrseitenläufe bleiben langsamer; Übersicht mit echtenWerten folgt. Keine allgemeineWeb-Speedup-Aussage.

| Szenario,p50ms | Vorher | Nachher |
| -------------- | -----: | ------: |
| navigation     |    451 |     380 |
| search         |    834 |     997 |
| form           |   1473 |     818 |
| dropdown       |   1249 |     601 |
| dynamic        |   1246 |    1030 |
| multistep      |   1145 |    1350 |
| already        |    315 |      98 |
| stale          |    584 |     595 |

Bedingungen: achtHTTP-Fixtures × fünfWiederholungen, abwechselndeA/B-Reihenfolge; gleicheJev-1.13-API, Konfidenz0.5 undmax10Schritte, proVariante eigenerProfilkontext/einTab. Timer umfasst Navigation, Entscheidungen, Aktionen, Abschlussprüfung undScreenshot sowie unabhängigesNachlesen. Browserstarts liegen nachWarmup außerhalb. Originalcode aus unverändertemLive-Release; SHA256 inManifesten. InterneBrowserbefehle zählen Goal-Ausführung ohne Prüfinstrumentierung; äußererMCP-Aufruf und aktiveCoding-Agent-Planung nicht im Mikrobenchmark. Entscheidungsanteil anLaufzeit74.4%→70.5%; Provider-/Retry-Wartezeit ist der wesentliche gemesseneAnteil. KeineCPU-Limit-Erhöhung.

API meldet Tokens, keinen Rechnungsbetrag; Kostentarif nicht verfügbar. Dollar-Kosten sind ungeprüft. Unter einem unveränderten linearenToken-Tarif sinken beide Verbrauchsrichtungen; tatsächlicheAbrechnung wird nicht behauptet. DerUpstream nennt dieselbeAbrechnungsgrenze in `docs/performance.md` des gepinntenCommits.

Reproduktion: `BROWSER_BENCH_BASELINE=<original-release> BROWSER_BENCH_CANDIDATE=<candidate-release> BROWSER_BENCH_VARIANTS=baseline,candidate BROWSER_BENCH_REPETITIONS=5 pandaos-android-queue -- node packages/server/scripts/benchmark-browser.mjs`; fürWikipedia zusätzlich`BROWSER_BENCH_ONLY_PUBLIC=1`. NeueOutput-Verzeichnisse per`BROWSER_BENCH_OUTPUT` verwenden. KeinBuild/Ändern des Original-Releases.

## Produktivabschluss: 20. Oktober 2026

Der Kandidat `/home/admin/.local/share/pandaos-releases/1f3aa4d8-browser-autonomous` wurde über den offiziellen geplanten Neustart `2026-10-20T02-56-09-744Z` aktiviert. Der Dienst ist aktiv, der Live-Symlink zeigt auf den Kandidaten und serverId `srv_RtppvtlARpFR` ist unverändert. Alle 45 Overlay-Hashes stimmen nach dem Rollout. Basis und Rollback bleiben `ac6fe03a1-profile-hub`. Die getrennte Rekonstruktionsdatei `browser-changes.patch` ist gegen HEAD `1f3aa4d8ab64c5485334f0346d460158caa167fc` in einem isolierten Index geprüft; fremde Änderungen wurden nicht aufgenommen. Die zuvor vorhandene 404-Antwort der Daemonwurzel ohne Web-Bundle bleibt unverändert.

Die native Ultrafast-DOM-Erfassung und Guard-Prüfung sind in den vorhandenen Browser integriert; generische Snapshots bleiben kompatibel. Vorhandene Rezeptausführung und bereits erfüllte Prüfkriterien bilden den deterministischen Pfad. Jev bleibt die konfigurierte Entscheidungsquelle; bei Unsicherheit übernimmt der bereits aktive Agent über seine bestehenden Browserwerkzeuge. Keine neue Provider- oder Agentenschicht, kein eigenmächtiger Modellwechsel. Passwort-, OTP- und Zahlungswerte werden aus dem Jev-Zustand maskiert. Abschlussmeldungen benötigen tatsächliche Text-/URL-Prüfungen; unklare Dispatch-Ergebnisse werden nicht automatisch wiederholt.

### Tatsächliche Produktivtests

Der aktive Codex-Agent hat die neu gestarteten MCP-Werkzeuge selbst verwendet, mit dem bestehenden Jev-1.13.0-Provider:

- Formular `evr_325fd37e-1d4d-4ddb-8346-1a66ff949c39`: Route eingegeben, First gewählt, vorhandenes Direct-only beibehalten, einmal abgesendet; exakter Ergebnistext und Screenshot bestätigt. Drei Jev-Entscheidungen, 5882 Input-/556 Output-Tokens; vollständiger Rezeptlauf 7518 ms. Ein Konsolenfehler betrifft ausschließlich das fehlende Fixture-Favicon, keine fehlgeschlagene Aufgabenanforderung.
- Wikipedia `evr_784b924e-f756-4707-86b3-51f832f47a48`: Alan-Turing-Biografie bis zum Turing-machine-Artikel, Ziel-URL und Text unabhängig geprüft. Zwei Entscheidungen, 16792 Input-/1192 Output-Tokens, vollständiger Rezeptlauf 4572 ms. Keine Konsolenfehler/fehlgeschlagenen Requests. Auf der bisherigen Version schlug dieselbe Goal-Aufgabe mit HTTP422 fehl; die Ursache bzw. exakte Requestgrenze bleibt ungeklärt.
- Fast Path `evr_186b1c24-afd2-4b54-891e-b05d27221238`: Navigation und beobachteter Linkklick per gespeichertem Rezept, danach tatsächliche URL-/Textprüfung: null Jev-Entscheidungen und null Modell-Tokens. Der frühere einfache Textcheck wurde durch den expliziten URL-Check ergänzt. Die Folge ist als `browser-autonomous-fast-wiki` gespeichert.
- Kontrollierte Agentenübernahme: Goal absichtlich auf einen Schritt beschränkt, FILL ausgeführt und korrekt als limit zurückgegeben. Auf demselben Tab `1792465075767-9f8a3bec83e13205` Snapshot und reale Feldwerte gelesen, nur fehlendes SELECT und einmal CLICK ausgeführt. Exakter Ergebnistext bestanden, erneute Goal-Prüfung meldet ausdrücklich bereits erfüllt mit null Entscheidungen. Die bestehende Eingabe wurde nicht wiederholt.

Evidenzdateien: `.dev/jev-ultrafast/production-reports.json`, `production-bounded.json`, `production-recovered.json`, `production-fast.json`, `production-train.png`, `production-wikipedia.png`. Screenshots selbst angesehen. Die getrennten 40 Vergleichsläufe je Variante behalten ihre oben dokumentierten Messbedingungen; Produktiv-Rezeptzeiten sind wegen anderem Hostpfad/Kaltstart nicht als Mikrobenchmark-Speedup verrechnet.

### Gemessener Vergleich und Grenzen

Acht zur Entwicklung verwendete Szenarien mit je fünf alternierenden Wiederholungen: Erfolg 35/40 → 40/40; p50 1026 → 626 ms, p95 1473 → 1350 ms; interne Browserbefehle 295 → 324; Provider-Aufrufe 115 → 89; Input-Tokens 127033 → 125201; Output-Tokens 15210 → 11198; absichtlich ausgelöste Stale-Retries 0 → 5; Handoffs 5 → 0. Alle fünf alten Fehler betreffen das Dropdown-Szenario. Die 35 beidseitig erfolgreichen Läufe ergeben p50 935 → 817 ms und p95 1531 → 1365 ms. Zusätzliche Browserbefehle sind der dokumentierte Preis für abgeschlossene Dropdown-Arbeit und Stale-Schutz. Einige Einzelaufgaben bleiben langsamer. Kein allgemeines Web-Leistungsversprechen aus diesen acht Szenarien.

Zusätzlich auf dem öffentlichen Wikipedia-Szenario mit tatsächlichen unveränderlichen Release-Modulen: Original 0/5, Kandidat 5/5; Kandidatmedian 1359 ms. Es handelt sich um eine weitere Seitensituation, kein breites unabhängiges Holdout-Set. Bisherige generische Mehrfeld-/Profil- und native Schutztests bestanden gezielt; keine vollständige lokale Suite. Finale Prüfung: 20 Runner-, 54 Tool- und 2 fokussierte native Tests, Build, Typecheck und gezielter Lint bestanden. Keine Mac-/iOS-/Android-Clientprüfung behauptet. Generische lange Ref-IDs haben zusätzliche, noch nicht tokenisierte Kosten. Dollar-Abrechnung nicht verfügbar; Kosten pro Aufgabe daher nicht ermittelt. Token- und Aufrufverbrauch sind echte Messwerte.

Anti-Slop Delivery Gate: PASS für die oben tatsächlich geprüften Integration-, Ergebnis- und Belegkriterien. Visuelles Redesign und Marketing sind nicht anwendbar. Breite Webseitenabdeckung, sämtliche Provider und native Clients bleiben ungeprüft. Auftrag auf dem laufenden Host erfüllt; Sessions und Nutzertabs bleiben offen. Der kurzlebige synthetische Fixture-Service läuft begrenzt weiter, keine dauerhaften Watcher oder offenen Buildjobs.
