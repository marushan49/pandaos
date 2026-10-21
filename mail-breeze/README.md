# Mail Breeze

Mail Breeze sortiert eingehende Gmail- oder Outlook-Mails vor und leitet aus wichtigen Mails To-dos ab. Einen Claude-Agenten startest du bei Bedarf selbst. Deine Antworten schreibst du weiterhin selbst. Es gibt keine Funktion zum Entwerfen oder Versenden von Mails.

## Einstieg

Öffne **Mail Breeze** in der Seitenleiste oder über die Befehlssuche. Im Arbeitsbereich kannst du Mail Breeze auch als eigenen Tab öffnen.

- **Demo-Daten laden** zeigt drei ausdrücklich gekennzeichnete Beispiele. Die Bearbeitung startet erst über **Agent starten**. Die Ergebnisse kommen vom echten Agenten.
- **Mail manuell importieren** übernimmt einen eingefügten Mailtext. Der ursprüngliche Text bleibt bei der Aufgabe sichtbar.
- **Einstellungen** speichert Personenrollen, Projektwissen und bei Bedarf einen bestehenden Arbeitsordner auf dem verbundenen Host. Ohne Projektordner nutzt Mail Breeze einen eigenen gemeinsamen Arbeitsbereich.
- **Agent öffnen** führt zur laufenden Bearbeitung oder zu einer nötigen Rückfrage. Bestehende Agentenberechtigungen gelten weiter.

## Gmail verbinden

Unter **Postfach → Gmail** nutzt Mail Breeze den bereits verbundenen Gmail-Zugang im lokalen Codex-Business-Profil. Auf diesem Host ist das `marushan49@gmail.com`; die Outlook-Weiterleitung ist bereits eingerichtet. Der Kontoabgleich verhindert, dass nach einem Kontowechsel versehentlich ein anderes Postfach importiert wird.

Der Abruf ruft ausschließlich die drei Lesewerkzeuge für Profil, Suche und Nachrichten über den [Codex App Server](https://learn.chatgpt.com/docs/app-server) auf. Er startet keinen KI-Modellzug. Voraussetzung sind der lokale Befehl `codex`, das Profil `~/.codex-business/config.toml` und dessen bestehende Gmail-Verbindung. Das ist eine lokale Integration auf diesem Host, keine neue Google-App-Registrierung.

Neue Posteingangsmails werden ab dem Verbindungszeitpunkt gelesen. Die Standardsuche schließt Werbung und soziale Kategorien aus; Spam, Papierkorb, gesendete Mails und Entwürfe werden zusätzlich ausgeschlossen. Ein Lauf liest höchstens 25 Suchtreffer und fünf zuvor fehlgeschlagene Nachrichten. Weitere Seiten folgen ungefähr nach einer Minute. Sonst wird nach 5 Minuten erneut gelesen, bei leeren Läufen nach 10 und 20 Minuten; **Jetzt lesen** startet sofort.

Die Suchfenster überlappen sich um zehn Minuten, um verzögerte Indizierung abzufangen. Nachrichten-IDs verhindern doppelte Aufgaben. Einzelne unlesbare Mails bleiben zur Wiederholung gespeichert und blockieren andere Mails nicht; bei dauerhaft unlesbaren oder gelöschten Nachrichten bleibt der Fehler sichtbar. Die begrenzten Wiederholungen laufen weiter, damit vorübergehende Fehler keine Aufgaben dauerhaft verlieren lassen. Eine spätere Indizierung außerhalb dieser Überlappung ist nicht abgedeckt. Mit **Trennen** stoppt nur Mail Breeze; der Codex-Gmail-Zugang und importierte Aufgaben bleiben bestehen.

## Einordnung und To-dos

1. **Ohne Modell aussortiert:** Werbung und soziale Kategorien schließt schon die Gmail-Suche aus. Mails mit `Precedence: bulk/list/junk` oder `Auto-Submitted` landen direkt unter **Verworfen** mit dem Hinweis „Automatisch aussortiert“. `List-Unsubscribe` allein reicht nicht, weil auch Fristhinweise wie die Supabase-Grant-Änderung diese Kopfzeile tragen.
2. **Einordnung mit GPT-6 Luna:** Alle übrigen neuen Mails eines Abrufs ordnet ein gemeinsamer Lauf mit `codex-plus/gpt-6-luna` (Thinking `low`) ein, höchstens zehn Mails pro Lauf. Pro Lauf entsteht ein Agent „Breeze Einordnung“.
3. **Wichtig:** Wichtige Mails stehen unter **Braucht dich**. Die Liste zeigt die Anzahl ihrer To-dos, die Detailansicht die To-dos und eine Kurzfassung. Unwichtige Mails stehen mit Kurzfassung unter **Verworfen**.
4. **Deine Regeln:** Unter **Einstellungen → Was ist für dich wichtig?** legst du fest, was wichtig ist, z. B. „Terminerinnerungen sind wichtig“. Diese Regeln haben bei der Einordnung Vorrang vor den Standardregeln.
5. **Claude bearbeiten lassen:** Der Claude-Agent startet nur, wenn du das per Klick auslöst. Automatisch startet er nicht mehr.

Gmail wird über die verbundene Codex-App von OpenAI gelesen. Die Einordnung läuft mit GPT-6 Luna über das private Codex-Konto, eine manuell gestartete Bearbeitung mit Claude bei Anthropic. Mailtexte und Aufgaben werden lokal im geschützten Plugin-Datenverzeichnis gespeichert. Anhänge werden nicht als Arbeitsmaterial importiert.

## Outlook verbinden

PandaOS benötigt einen eigenen Microsoft-Zugang. Eine Verbindung in ChatGPT oder Claude wird nicht automatisch auf den Zotac übertragen. Solange die App-Registrierung fehlt, zeigt der Outlook-Tab **Outlook ist noch nicht eingerichtet** und öffnet über **Einrichtung öffnen** die Einstellungen. Eine Anmeldung wird erst mit hinterlegter Client-ID angeboten.

1. Registriere eine eigene Anwendung im Microsoft Entra Admin Center. Wähle die Kontotypen passend zu deinem Outlook-Konto und aktiviere öffentliche Clientflows. Dafür ist kein Clientgeheimnis nötig. In Firmen kann die Freigabe durch einen Administrator erforderlich sein.
2. Hinterlege delegierte Microsoft-Graph-Berechtigungen **Mail.Read** und **User.Read**. Mail Breeze fordert zusätzlich **offline_access** für die laufende Verbindung an. Es fordert keine Mail-Schreib- oder Versandberechtigung an.
3. Trage die Anwendungs-Client-ID und den Mandanten in **Einstellungen** ein. `common` eignet sich für eine entsprechend registrierte Anwendung mit mehreren Kontotypen; bei einer Firmenanwendung verwende den eigenen Mandanten.
4. Öffne **Postfach → Outlook**, wähle **Mit Outlook anmelden** und bestätige den angezeigten Code auf der Microsoft-Anmeldeseite.

Nach erfolgreicher Anmeldung werden neue Nachrichten im Posteingang ungefähr jede Minute abgeholt. Der Startpunkt ist der Zeitpunkt der Verbindung; bestehende Altbestände werden nicht ungefragt abgearbeitet. Mails desselben Gesprächs bleiben bei einer Aufgabe. Ein Aufgaben-Agent bearbeitet jeweils eine Aufgabe. Reine Informationen werden nach der Einordnung verworfen.

Mit **Trennen** entfernt Mail Breeze seine lokal gespeicherte Anmeldung. Bereits übernommene Aufgaben bleiben erhalten. Eine Microsoft-seitige Zugriffsfreigabe lässt sich zusätzlich im Microsoft-Konto widerrufen. Zugangsdaten bleiben im eigenen Plugin-Datenverzeichnis des Daemons und werden nicht an die Oberfläche übertragen.

## Grenzen der ersten Version

- Verarbeitet werden Mailtexte bis 40.000 Zeichen. Anhänge werden nicht heruntergeladen.
- Popups erscheinen bei geöffnetem Mail-Breeze-Screen. Native System- und Handybenachrichtigungen sind nicht verifiziert.
- Nach einem Plugin-Neustart wird die Hostverbindung beim ersten Öffnen oder Agentenereignis erneut übernommen; laufende Aufgaben werden mit ihrem bestehenden Agenten abgeglichen.
- Unklare oder fehlgeschlagene Agentenübermittlungen werden sichtbar zur Prüfung angehalten, statt ungeprüft dieselbe Arbeit erneut zu starten.

## Installation

```bash
pandaos plugin install /absoluter/pfad/mail-breeze
```

Der Host und die App müssen die im Manifest angegebene Plugin-Version unterstützen. Für Quelländerungen genügt `pandaos plugin reload mail-breeze`; ein Daemon-Neustart ist nicht nötig.

Microsoft-Referenzen: [Geräteanmeldung](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code), [Änderungen im Posteingang](https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0).
