# PDF-Vorschau im Datei-Tab

## Fehler und Ursache

Ein Klick auf einen PDF-Link im Chat öffnete den Datei-Tab mit „Binary preview unavailable“. Der Datei-Tab kannte nur Text und Bilder; die PDF-Bytes kamen vollständig an, wurden aber als unbekannte Binärdatei behandelt.

## Änderung

Commit `335f01c65` auf `main`: Dateien mit `%PDF-`-Signatur werden im Web und in Electron als `application/pdf`-Blob abgelegt und per `<embed>` im eingebauten Chromium-PDF-Viewer angezeigt. Ein sandboxed `<iframe>` blockiert den Viewer, deshalb `<embed>`. Native (iOS/Android) behält den bisherigen Hinweis, weil die Android-WebView keine PDFs darstellt.

## Nachweise

- Format, Lint, Typecheck: Queue #1341 und Folgelauf grün.
- Web-Klicktest gegen isolierte Vorschau (`.dev/pdf-preview`, Port 34027): Datei-Tab `testbericht.pdf` zeigt die PDF mit Seitenleiste und Zoom. `browser_test` `evr_3425a835-8f14-45f7-87c2-b2d9dc0da8ec` blieb an einem mehrdeutigen Sidebar-Klick hängen; Rest manuell im selben Tab, Screenshot `evr_3f881671-956c-4496-9973-6fead4e50da7`.
- Electron 44.2.0 unter xvfb mit den Fenstereinstellungen der Desktop-App (Queue #1352): `navigator.pdfViewerEnabled` true, Blob-PDF per `<embed>` gerendert (`.dev/pdf-preview/electron-check/electron-pdf.png`). Desktop-Renderer hat keine CSP.

## Mac-Auslieferung

Nach Freigabe am 16.10.2026: Nur `Resources/app-dist` ersetzt, `app.asar` und Info.plist unverändert. Basis ist exakt der Mac-Stand vom 13.10. (`.dev/mac-ide-menu/source-snapshot`) plus PDF-Patch, damit keine ungeprüften Main-Änderungen mitkommen. Paket `.dev/pdf-preview/mac/pdf-preview-update.tgz` (SHA-256 `b03ed15b…08ff6`, 48 geprüfte Dateien), Installationsskript mit Hash-Schutz, Backup und Rollback unter `~/Library/Application Support/PandaOS/rollout-backups/pdf-preview`. Neu signiert, `codesign --verify` ok, PandaOS beendet und neu geöffnet. Renderer-`index.html` jetzt `4a1535c9…2106b`. App kam hoch und verbunden mit Zotac (Fenstertitel einer Zotac-Session). Ein nativer Klick auf eine PDF in der Mac-App wurde nicht automatisiert geprüft: `screencapture` und der AX-Baum sind über SSH nicht verfügbar.
