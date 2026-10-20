# Gemini „Speak to Window“ analysiert (2026-10-14)

Ziel: Mikrofon-Diktat in PandaOS nach Vorbild der Gemini-Mac-App.

## Quelle

- `/Applications/Gemini.app` auf dem Mac, Version 1.128.14.1166, Mach-O arm64, 204 MB.
- Kopie für REA: `/tmp/rea-gemini/Gemini` (sha256 `8cd89234b23182234e8e211e1449ae44e0a831b2185e98f4d1371a83c66f8964`).
- REA `open_binary` erfolgreich. Tiefenanalyse blockiert: kein Ghidra/Hopper/IDA auf dem Zotac, `inspect_macho` nur unter macOS. Befunde daher aus Strings und Swift-Symbolnamen.

## Befunde (verifiziert aus dem Binary)

- Interner Name: StreamToCursor (STC). Dateien: `STCRecorder`, `STCPaster`, `STCUndoMonitor`, `STCEscapeHotKey`, `ContextCollector`, `PasteTargetChecker`, `StreamToCursorCoordinator`.
- Spracherkennung: `S3SpeechRecognizerClient` gegen `speechs3proto2-pa.googleapis.com` (`/$rpc/speech.s3.S3StubbyClientConnectorService/S3Bidi`). Privater Google-Endpunkt, Anmeldung über das Google-Konto (`gaiaAccountID is required`, `Cannot stream to cursor: No authenticated account`).
- Modi (`STCProcessingMode`): `dictationOnly` und `alwaysCallGemini`. „Schlussfolgern“ = `stcUseReasoning`; ohne Bildschirmaufnahme-Recht fällt es auf `dictationOnly` zurück.
- Kontext: Screenshot des aktiven Fensters, Zwischenablage und Dokument des Fensters werden vorab hochgeladen.
- Einfügen: `PasteTargetChecker` mit Stufen `settableValue`, `editableRole`, `windowFallback` (nur Bundle-IDs aus einer serverseitigen Allowlist). Danach Cmd-Z-Überwachung, Esc bricht ab, Toast fügt das Rohtranskript sofort ein.
- Start von außen: Launcher-Argumente `--stream-to-cursor`, `--stc-processing-mode=`.

## Folgerung

- Den Google-Konto-Sprachdienst in PandaOS nachzubauen ist nicht tragfähig: privater `-pa`-Endpunkt mit Konto-Token, keine öffentliche Schnittstelle.
- Gemini Speak to Window fügt laut Prüflogik in jedes Feld mit editierbarer AX-Rolle ein; das PandaOS-Eingabefeld (`sh.pandaos.desktop`, Electron-Textarea) sollte darunter fallen (abgeleitet, nicht getestet).
- PandaOS-eigener Weg: Diktat hat Provider `local` und `openai`; ein `gemini`-Provider über die öffentliche Gemini API (API-Schlüssel aus AI Studio) wäre analog zu `OpenAISTT` baubar.
- Stand Zotac: `~/.paseo/config.json` hat `features.dictation.enabled: false`.

## Umsetzung Stand 2026-10-14

- Lokale Engine gemessen (Parakeet TDT v3 int8, `test_wavs/de.wav`, 2,8 s Audio): 1,2 GB RSS nach Laden, Spitze 1,8 GB, Laden ca. 2 s, Erkennung 0,2 s bei 1 Thread (RTF 0,07), Text fehlerfrei. Worker entlädt nach 5 min Leerlauf (`DEFAULT_IDLE_TTL_MS`).
- `~/.paseo/config.json`: `features.dictation = {enabled: true, stt: {provider: local, model: parakeet-tdt-0.6b-v3-int8, language: de}}`, Backup `config.json.bak-2026-10-14-dictation`. Standardmodell wäre v2 (nur Englisch). Wirksam nach geplantem Daemon-Neustart.
- Ghidra 12.1.4 unter `~/.local/share/ghidra_12.1.4_PUBLIC`, in `~/.claude.json` für REA-MCP registriert (`GHIDRA_INSTALL_DIR`, `JAVA_HOME`).
- Tiefenanalyse läuft als `systemd --user` Unit `rea-gemini-ghidra` (max. 20 GB, 4 Kerne, 6 h), Snapshot `/tmp/rea-gemini/gemini.snapshot`, Ausgabe `/tmp/rea-gemini/analyze.json`.
- Google-Konto-Weg: OAuth-Client der Mac-App mit Scope `https://www.googleapis.com/auth/assistant` u. a., Token-Refresh über `oauth2/v4/token`. Nachbau braucht das Refresh-Token aus dem Mac-Schlüsselbund und die S3-Protobufs; Risiko Kontosperre, Rückfrage vor jedem Live-Aufruf.
- Nach geplantem Neustart (Lauf 2026-10-14T08-20-52-122Z) meldet `daemon.log` `effectiveProviders.dictationStt: "local"`. Echter Sprachtest im Eingabefeld steht noch aus (braucht Marushans Mikrofon).
- Heartbeat `9591d0ca` prüft die Ghidra-Analyse alle 30 min, läuft bis 15:23 ab.
- Lauf 1 der Ghidra-Analyse brach nach 5,5 min mit `provider_timeout` ab (REA-Standard `REA_GHIDRA_STARTUP_TIMEOUT_MS=330000`). Lauf 2 mit `21000000` gestartet 08:30 UTC, Wert auch in `~/.claude.json` für REA-MCP. Heartbeat jetzt `a035661f` (alle 45 min, bis 15:31).
- Lauf 2 nach 1 h 44 min gescheitert: `OutOfMemoryError: Java heap space` (JVM nahm 25 % der 20-GB-Grenze). Ursache: Ghidra `MAXMEM_DEFAULT=2G`. Lauf 3 ab 12:25 CEST mit `GHIDRA_HEADLESS_MAXMEM=18G`, `MemoryMax=24G` (auch in `~/.claude.json`).
- 2026-10-14: Auf Marushans Wunsch gestoppt. Ghidra-Lauf 3 beendet, Heartbeat gelöscht. Entscheidung: lokales Diktat (Parakeet v3) bleibt, kein Google-Konto-Nachbau.
