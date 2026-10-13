# Content-Blocks mit Rich-Copy und Bearbeiten, 2026-10-14

## Auftrag

Antworten sollen je nach Inhalt als E-Mail, Dokument, Prompt oder Code erscheinen, formatiert kopierbar sein (HTML plus Klartext), mehrere Kopiermodi anbieten und sich direkt im Block bearbeiten lassen. Vorlage: Writing- und Code-Blocks von ChatGPT.

## Bestand

| Bereich                                              | Stand vorher                                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Code-Blöcke                                          | Syntax-Highlighting, Spracherkennung, Copy-Knopf kopiert nur den Code ohne Zäune (`highlighted-code-block.tsx`) |
| JSON, YAML, XML, SQL                                 | laufen über denselben Code-Block                                                                                |
| `writing`                                            | Karte mit Copy-Knopf, wörtlicher Klartext                                                                       |
| `writing-rich`                                       | gerendertes Markdown, Kopieren als HTML (seit 2026-10-13)                                                       |
| Auswahl kopieren                                     | schreibt `text/html` und `text/plain` (`assistant-selection-copy`)                                              |
| Kopiermodi, Bearbeiten, E-Mail-Betreff, Prompt-Block | fehlen                                                                                                          |

## Entscheidungen

- Der Inhaltstyp kommt vom Agent über den Fence-Tag (`email <Betreff>`, `document <Titel>`, `prompt <Titel>`, `writing`, `writing-rich`). Ungetaggte Prosa bleibt normaler Chat; es gibt keine Heuristik.
- Bearbeiten heißt Markdown-Quelltext in einem Textfeld mit Fett, Kursiv und Überschrift, daneben die gerenderte Ansicht. Ein WYSIWYG-Editor bräuchte eine neue Abhängigkeit, die auf Web und Native unterschiedlich wäre.
- Bearbeitungen bleiben im Client (Speicher der Sitzung) und gehen nicht an den Agent.
- Formatiert kopieren schreibt auf Web `text/html` und einen selbst erzeugten Klartext. Fehlt `ClipboardItem`, landet Klartext. Auf iOS und Android leitet `expo-clipboard` den Klartext aus dem HTML ab.

## Fertig, wenn

- E-Mail mit Fett, Liste, Link und Tabelle: Formatiert kopieren liefert `<strong>`, `<ol>`/`<ul>`, `<a href>`, `<table>`; Als Text enthält keine `*`, `#`, `|`; Als Markdown liefert die Quelle.
- Python- und TypeScript-Code kopiert ohne Zäune.
- Text im Block bearbeitet, danach kopiert: Die Zwischenablage enthält die Änderung.
- Ohne `ClipboardItem` kopiert Formatiert ohne Fehler als Klartext.
- Einfügen in Gmail oder Outlook auf dem Mac ist nicht bestätigt, bis Marushan es prüft.

## Prüfung (Branch content-blocks, isolierte Vorschau auf Port 40087)

- Formatiert kopieren: `text/html` mit `<strong>`, `<em>`, `<ol>`, `<ul>`, `<a href>`, `<table>`, dazu Klartext ohne `*`, `#` und `|`.
- Als Text und Als Markdown aus dem Menü liefern Klartext bzw. die Markdown-Quelle.
- Python- und TypeScript-Block kopieren nur den Code.
- Bearbeiten: Cursor am Ende, Eingabe landet in der Zwischenablage, Fett umschließt die Auswahl, „Edited“ und Reset erscheinen, Reset stellt das Original her. Das Feld wächst mit dem Inhalt.
- Ohne `ClipboardItem` landet Klartext, ohne Fehler.
- Typecheck, Lint und 101 gezielte Tests grün (Queue #714 bis #718).
- Nicht bestätigt: Einfügen in Gmail, Outlook und Google Docs auf dem Mac, Verhalten auf iOS und Android.
