# Texte und Dateien im Chat liefern, 2026-10-13

## Anlass

Ein Agent hat einen Mail-Nachtrag als `.eml` per scp auf den Mac gelegt und im Chat nur `~/Downloads/…eml` und eine Inhaltsangabe gemeldet. Der Pfad war nicht klickbar, der Text war nicht kopierbar, die Tabelle fehlte.

## Befunde

1. Den `writing`-Block gab es schon, der Agent hat ihn nicht benutzt. Die Anweisung verlangte nicht, den Text auch dann im Chat zu zeigen, wenn er zusätzlich als Datei oder Entwurf abgelegt wird.
2. `writing` kopiert nur reinen Text. Eine Tabelle kommt in Outlook nicht als Tabelle an.
3. Der Pfad war aus drei Gründen nicht öffnbar: er lag auf dem Mac statt auf dem Agent-Host, `~` ist kein absoluter Pfad, und für `.eml` gab es keine Karte. Nur Videos hatten eine Download-Karte.
4. Für Mails gibt es in der Session das Microsoft-365-Werkzeug `outlook_create_reply_all_draft`, das einen echten Entwurf im Thread anlegt. Dass es für Marushans Konto freigeschaltet ist, ist nicht bestätigt.
5. Die 98 Upstream-Commits seit 0.11.0 enthalten nichts davon. Der Merge ist Wartung, kein Teil der Lösung.

## Entscheidungen

- Neuer Fence `writing-rich`: Markdown wird gerendert, Kopieren legt HTML und Klartext ab. `writing` bleibt Standard und bleibt wörtlich.
- Links mit absolutem Host-Pfad auf Dokumente, Archive und Audio werden zur Dateikarte mit Download. Der Download nutzt die Token-Pipeline des Datei-Explorers mit dem Ordner der Datei als Wurzel.
- Die Daemon-Anweisung verlangt jetzt: fertigen Text immer im Chat zeigen und Dateien auf dem eigenen Host mit absolutem Pfad verlinken.

## Fertig, wenn

- Branch `chat-dateikarten` ist in main und ausgerollt.
- Ein Agent-Text mit `writing-rich`-Tabelle lässt sich in Outlook als Tabelle einfügen. Das ist auf dem Mac noch nicht geprüft.
- Ein Link `[x.eml](</abs/pfad/x.eml>)` zeigt eine Karte, und Download legt die Datei auf dem Gerät ab. Das ist im echten Client noch nicht geprüft.
