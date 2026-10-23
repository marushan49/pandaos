# Gleichmäßige Abstände bei Sitzungsnachrichten im Chat

Befund: Im Chatverlauf schaltet `MessageOuterSpacingProvider` die eigenen Außenabstände aller Elemente ab; nur `AgentMessageRow` („Session finished“, „Received message from“) setzte weiter 4 px bzw. 16 px am Sequenzende. Werkzeug-Pillen hatten 0 px und 32 px Höhe, Sitzungszeilen 25 px. Je nach Reihenfolge entstanden 0, 4 oder 16 px Abstand.

Änderung: `AgentMessageRow` beachtet den Kontext über das exportierte `useDisableOuterSpacing` und hat die Pillenhöhe `CONTROL_HEIGHTS.compact`. Außerhalb des Verlaufs bleiben die bisherigen Abstände.

Prüfung: Format, Lint, App-Typecheck und Webexport bestanden. `browser_test` evr_7f7385c5 im echten Chat „Update PandaOS on Zotac, Mac, and Android“ bestanden (0 fehlgeschlagene Requests, 0 Konsolenfehler). Gemessen nach der Änderung: 11 Elemente, alle 32 px hoch, alle Abstände 0 px, Zeilenabstand gleichmäßig 32 px. Screenshot evr_7a3b2d23…/screenshot angesehen (1280x720, hell, Standardschrift): Pille, zwei Nachrichtenzeilen, Pille gleichmäßig. Mac nicht installiert.
