# Symboltabs, Browserfortschritt und Aufgaben-Werkzeug

## Ergebnis

Auf Zotac und Mac aktiviert. Symbole gelten für die rechte Sidebar; Haupttabs, insbesondere Browser, zeigen wieder Titel. Das Plus bleibt unverändert. Es gibt keinen fest eingeblendeten Tasks-Block über dem Chat oder anderen Werkzeugen. Aufgaben ist ein eigener optionaler Tab mit Checklistenicon im vorhandenen Launcher. Der Tab verwendet vorhandene echte Todo-/Arbeitsstände und zeigt ohne Checkliste mindestens Titel und Status.

Tatsächliche Browserläufe erscheinen zusätzlich rechts mit Schritten und Symbolaktionen. Skip wartet auf die Schrittgrenze, unterbricht keine laufende Aktion und zählt niemals als bestanden. Reine Skip-Läufe bleiben unvollständig sichtbar; spätere echte Fehler bleiben eindeutige Fehlschläge. Der letzte Schritt wird nach Abschluss korrekt markiert.

## Checkpoint

Fertig, keine Folgearbeit oder Freigabe offen. Nutzerfreigabe „japp mach as“ für Zotac/Mac genutzt. Aktiver Release `/home/admin/.local/share/pandaos-releases/e2e-progress-icons-final`, Basis `dnd-main-tab`, geplante Aktivierung 2026-10-22T11-37-42-746Z erfolgreich. Server-ID srv_RtppvtlARpFR erhalten, Service active, Recovery bestätigt. Nach konkreten Nutzerkorrekturen ausschließlich statische UI aktualisiert, kein weiterer Daemonrestart.

Aktueller Webindex SHA256 3257a0b95f5a045c8f730e214996cfed1eab488a7d8b9d912330a0ed2b9e8da1. HTTP ergänzt den bestehenden Initial-Connection-Scriptblock; daher ist der rohe HTTP-Hash anders. Vorhandene Hashassets bleiben für geladene Clients erhalten, Index atomar ersetzt. Aktuelles Mac-Bundle 7d0d173311bc185e20c4914284343f6acb1cb405bf36ea6af7b33b116686e5f9, codesign verifiziert und Prozess96513 nach Wiederöffnung bestätigt. app.asar bca23f26 unverändert. Mac-Backup `/Users/mau/Library/Application Support/PandaOS/rollout-backups/ui-correction-20261022-134829`.

Keine laufenden eigenen Build-/Install-/Testprozesse, kein SSH-Tunnel angelegt. Heartbeat8db8ffa2 gelöscht; ältere Heartbeats da706e64/3b311e02 ebenfalls gelöscht. Agent-Sessions und Browser bleiben offen. Kein Commit/Push, kein Blanket-Staging. Fremde Änderungen und vorhandener Index erhalten.

## Aktuelle Abnahme

- Funktion/Sichtprüfung bestanden: nach echtem Seitenreload lädt der Produktbrowser index-03ce12793bcbd9cf3f1416f6a6db79ac.js. DOM vor Öffnen des Aufgaben-Tabs: null Aufgabenpanels. Rechte Sidebar über vorhandenen Knopf geöffnet, normales Plus und Tasks-Menüeintrag tatsächlich geklickt. Danach genau ein Aufgabenpanel, innerhalb der rechten Sidebar; Plus vorhanden. Haupt-Browsertitel sichtbar. Endbild tatsächlich mit view_image angesehen: `/home/admin/.pandaos/artifacts/wks_87cf2bbf78a1437f/evr_408bfcc2-8b2a-42e5-bdb2-1467b6f485d5/screenshot.png`.
- Prüfumgebung: bestehende Produktansicht1571x1049, Systemtheme, normale Schrift. Keine Größen-/Theme-/Schriftmatrix. Das Bild zeigt Aufgaben ausschließlich als ausgewählten Sidebar-Tab, daneben Files/Changes-Symbole und Plus; keine Tasks-Zeile im Hauptbereich.
- Aktuelle Codechecks: Queue11108a4efbcb5b247c7952c2da2a30da105, Format/Lint20Dateien0/0, App-Typecheck grün,16Layout/Catalogtests und2TaskManifest/Identitytests grün. Neuer Persistenztest erwartete irrtümlich keine automatischen Files/Changes-Tabs; Assertion auf den beauftragten Tasks-Stand begrenzt, keine Produktänderung. Queue114b2eabdc82c37421699d704f173da044a: gezielter Persistenztest1/1, Format/Lint0, Browser-/Electron-Export erfolgreich. Keine unveränderten Backendtests wiederholt.
- Mac-Installation verifiziert: Payloadsha ba20b447ccd1d6702a0e76390890fcb2a8dff50697072b368bc481e776509c21 auf beiden Hosts gleich, erwarteter alter/neuer Index vor Austausch geprüft, Backup, Signaturprüfung, App-Neustart und nachträglicher Hash-/Prozesscheck erfolgreich. Native Mac-Screenshotaufnahme war technisch nicht möglich; dafür keine native Sichtfreigabe behauptet. Sichtbeleg stammt vom Produktbrowser.
- Browserprüfung begann mit browser_test. Der Goal-Schnellcheck evr_75fc916e übersprang Aktionen wegen bereits sichtbarem Text Tasks; dessen PASS belegt den Ablauf nicht. Bild zeigte zudem noch das alte geladene JS. Deshalb nach echtem Reload denselben Browser manuell übernommen und die sichtbaren Bedienelemente geklickt; obiger Endbeleg ist maßgeblich. Browser_ref-Selektoren waren mehrdeutig, daher tatsächliche vorhandene data-testid-Knöpfe per browser_evaluate verwendet. Eigene gespeicherte Rezeptfassung prüft jetzt ausdrücklich Focus-session-Button statt eines bereits im Chat vorkommenden Wortes.

## Frühere Nachweise

Safe-Skip und E2E-Endzustand wurden vor der reinen Platzierungskorrektur real geprüft: evr_c43a2ac0-96e2-4d2d-aee1-5834c9356058 mit Skip3, Takeover, Pause, Resume und Browser-Fokus. RPC `.dev/e2e-progress/live-result.json` per Assertions: status fail, genau ein skipped/okfalse, übrigeChecks true,errornull. Finale Schrittmarker und kurze Skipzusammenfassung in angesehenem Endbild korrekt. Testdaemon Queue73536811000d9b411fbf212ea11a5f54b9 kontrolliert beendet.

Frühe Plananzeige evr_d7c03b05 zeigte kanonische Todo-Timeline sowie Mindestanzeige ohne Checkliste. Agenten dabei vorhandene Testadapter mit vertraglichem initialTimeline und identischem streamHistory; echte Daemon-/Timeline-/Browserstrecke, keine bezahlten Provideraufrufe. Nutzer verlegte diese Anzeige danach ausdrücklich in einen eigenen optionalen Tab. Breite Main-Zeile und permanente Sidebar-Tasks sind durch den letzten Stand entfernt.

Finaler ursprünglicher Stackbuild Queue59fdcde497048744609abfec6672c667ca: Server/CLI, Server+App-Typecheck, Browser-/Electron-Export grün. Zuvor62App-,2Skip-Endzustandsregressionen und101ausgewählteBackend/Clienttests grün. Kein Vollsuite-Lauf.

## Quellen und Grenzen

Vorhandene Panelregistrierung/Launcher/Persistenz/Identität für lokales target tasks erweitert. Keine Protokolländerung oder neue Abhängigkeit. WorkspaceTaskPlan/TaskListRow/Turnstatus wiederverwendet. E2E-Fortschritt bleibt in WorkspaceActivity ohne permanenten allgemeinen Plan. Host-/Workspace-Scope unverändert. Keine Bearbeitung des Agentenplans und kein Skip freier Browserziele ohne definierte Rezeptschritte.

Reproduktion unter `.dev/e2e-progress/`: ursprünglicher build-final.sh/source-final.patch; letzte Quellenliste ui-correction-files.txt, build-ui-correction.sh und gezielter finish-ui-correction.sh; publish-ui-correction.py mit erhaltenen Altassets; Mac-Archiv mac-correction-app-dist.tar.gz und install-mac-correction.sh. Queue102 war ein durch spätere Nutzerkorrektur überholter UI-Export und wurde nicht installiert. Ein versehentlich alsCommand eingereihter status--json-Job104 ist beendet. Kein permanenter Watcher.

Abschlussadvisor fand vor der letzten Platzierungskorrektur keinen Blocker. Niedriger Restbefund: identische Todo-Texte ohne IDs können eine React-Key-Warnung erzeugen; vorhandene Tasks mit IDs sind eindeutig. Native Geräteprüfung und zusätzliche Layoutmatrizen nicht durchgeführt.
