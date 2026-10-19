# Dateidownload über Relay

## Fehler und Ursache

Die Dateikarte konnte ein gültiges Download-Token über die aktive Host-Verbindung anfordern. Anschließend suchte der Download-Store ausschließlich nach einem gespeicherten `directTcp`-Endpunkt und versuchte einen separaten HTTP-Download. Ein ausschließlich über Relay erreichbarer Host endete deshalb mit „Download host is unavailable“.

## Änderung

Der gemeinsame Download-Hook verwendet den bestehenden `DaemonClient.readFile` über die aktive Verbindung. Der Store prüft die vollständige Bytezahl und speichert die Daten im Browser als Blob oder auf Native über Expo File und den vorhandenen Share-Dialog. Chat-Dateikarten, Datei-Explorer und Diff-Ansicht verwenden denselben Hook. Keine neuen RPCs, HTTP-Proxys, Abhängigkeiten oder Host-Konfigurationsschalter.

Die Übertragung wird für den Download im Client-Speicher zusammengesetzt. Die bisherige HTTP-spezifische Fortschrittsanzeige entfällt; der bestehende laufende Zustand und Erfolg/Fehler bleiben erhalten. Die Prüfung gegen die angegebene Dateigröße verhindert, dass leere Legacy-Binärantworten als erfolgreiche Dateien gespeichert werden. Native Speicherung und sehr große Dateien sind in dieser Aufgabe nicht auf einem Endgerät geprüft.

## Fertig-Kriterien und Nachweise

- Web-Build Queue #1252 erfolgreich. Nach Entfernung eines unvollständigen zusätzlichen Übersetzungsschlüssels: Queue #1256 Format, App-Typecheck, gezieltes Lint und Web-Export erfolgreich. Logs `.dev/download-host-build.log` und `.dev/download-host/checks-final.log`.
- Echter verschlüsselter Relay-Dateitransfer: 300.041 Bytes, SHA-256 `95adfa5f9fa657240165751c6b329e6ff6aa57672579f8796b17f41d57780c29`; `.dev/download-host/relay-proof.json`.
- Browser-Host über unterstützte `removeConnection`/`reconnectHost` ausschließlich auf Relay gestellt. Echter Klick auf den Download-Button erzeugt einen Blob mit exakt derselben Bytezahl und Prüfsumme; `.dev/download-host/ui-relay-proof.json`.
- `browser_test` `evr_bfb1503c-d0d0-48db-8299-986192d98312` bestanden: PDF-Download bestätigt „Download complete“; fehlende Datei zeigt `ENOENT`. Beide Zustände mit Screenshots gespeichert. Rezept `file-card-download-and-error` in `paseo.json`.
- Erste Browserläufe scheiterten an Verbindungsdialog und geöffneter Sidebar; manuell abgeschlossen, danach erfolgreicher vollständig geskripteter Lauf. Keine Download-Funktion als aus den fehlgeschlagenen Läufen bestätigt gewertet.

## Gegenprüfung

Sonnet-Advisor `ee148914-8d58-4042-95bf-2809a26cb418`: fokussiertes Read-only-Review akzeptiert die Änderung ohne Blocker. Native `File.write(Uint8Array)` entspricht bestehenden App-Aufrufern. Speicherbedarf bei sehr großen Dateien und entfallende HTTP-Prozentanzeige bleiben benannte Grenzen. Kein nativer Gerätetest aus dem Review abgeleitet.

## Auslieferung und Grenzen

Quellcode und lokale Web-Vorschau geändert. Kein Commit, Push, produktiver Daemon-Neustart, Geräte-Rollout oder Android-Installation in diesem Auftrag. Die laufende App auf Marushans Handy enthält diese Änderung noch nicht. Die isolierte Vorschau und der Browser-Tab bleiben offen. Fremde Änderungen an Markdown/Message und bestehende `paseo.json`-Rezepte bleiben erhalten.

## Native Fortsetzung nach Entsperren

Xiaomi2506BPN68G über100.96.225.48:5555 erreichbar; Sperrstatus `showing=false`, `inputRestricted=false`. Appsh.pandaos0.11.2/code11002 zuletzt14.10.2026 aktualisiert; Launcher im Vordergrund. Geräteprüfung Queue1333/1334 erfolgreich. Diagnose-APK-Build1336 (`99201bd52ab140ad9c735aa529b114f1`, maximal1200s) läuft mit bestehendem Hermes-O0-Prüfprofil; keine Hostlimits geändert. Automatische Fortsetzung über Heartbeat2963d321 eingerichtet. Noch keine neue APK fertig oder installiert; native Downloadprüfung offen.

Build1336 endete nach1200s mitExit124. Gradle meldete erschöpften1GiB-Java-Heap bei `mergeExtDexRelease`; keine neue APK erzeugt. Ein begrenzter Wiederholungsversuch nutzt2GiB-Gradle-Heap und vorhandene native/Metro-Artefakte innerhalb unveränderter8GiB-Queue-Hostlimits, maximal600s. Kein Eingriff am produktiven Daemon oder Handy.

## Android-Prüfdatei bereit

Wiederholungsbuild1342 erfolgreich in1m59s; Queue1345 prüft APK-Signatur erfolgreich gegen die tatsächlich installierte APK. Kandidatsh.pandaos0.11.2/code11002, arm64,151.422.766Bytes, SHA256`ec91c27342dcb67717762c62a8f0a1f5eef86d6d39ba8b5dbea7c3efafbf4f90`. Gleicher Signaturschlüssel, bestehendes Hermes-O0-Diagnoseprofil. Datei `/home/admin/projects/pandaos/.dev/download-host/PandaOS-download-fix.apk`, Beleg `.dev/download-host/apk-verification.json`. Produktiver Host liefert den binären Dateitransfer bereits bytegenau; kein Daemon-Neustart nötig. Handy-App weiterhin unverändert; Installation und nativer Download warten auf konkrete Geräteupdate-Freigabe.

## Installation abgeschlossen

Marushan hat ausdrücklich nur die Installation freigegeben, keine Tests. Queue1346 (`9682692ed2bf46babc3f3c742a979544`) aktualisiert das Xiaomi per `adb install -r` erfolgreich. Paket-Rücklesen bestätigtsh.pandaos0.11.2/code11002; SHA256 der tatsächlich installiertenAPK stimmt exakt mit dem geprüften Kandidaten überein. Beleg `.dev/download-host/installation-receipt.json`. Keine App gestartet, kein UI-/Downloadtest nach der Installation, keine Geräteeinstellungen verändert. Heartbeat58cd8c92 entfernt. Der Installationsauftrag ist abgeschlossen.
