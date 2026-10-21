# Der Browser läuft dort, wo Marushan gerade ist (21.10.)

## Rückmeldung

Vom Mac aus ist der Zotac-Stream unbrauchbar: Scrollen geht nicht, Tippen kommt 5 s später, Google- und Apple-Anmeldungen verschwinden. Ziel: Der Browser öffnet sich auf dem Gerät, an dem er arbeitet; die Session auf dem Zotac arbeitet trotzdem damit, so wie der eingebaute Browser bei Claude und Codex. Logins sollen als „braucht dich“ oben erscheinen, nicht nur als roter Punkt.

## Befund (verifiziert im Code, Stand `629e88917`)

1. **Agent-Tabs landen immer auf dem Zotac.** `broker.ts:selectHostForCommand` nimmt für `new_tab` zuerst den Daemon-Host (`selectDaemonHost() ?? mostRecent`). `prefersDaemonHost` in `host-preference.ts` ist exportiert, aber nirgends benutzt. Jeder Agent-Tab erzwingt deshalb den Stream auf dem Mac.
2. **Mac-Tabs öffnen seit `dd2641439` (20.10., 02:44) im Stream.** Grund damals: Schrittleiste, Handoff-Leiste und „…“-Menü gibt es nur in `remote-pane.tsx`; `pane/index.electron.tsx` enthält keine Zeile davon. Die Hooks `useBrowserActivity`/`useActiveBrowserHandoff` und `panel.tsx` schlüsseln über `remoteBrowserId`, das bei lokalen Tabs `null` ist. Der lokale Tab konnte daher keinen Jev-Lauf anzeigen.
3. **Lokale Tabs sind für Agenten bereits erreichbar.** Die Mac-App registriert sich als Browser-Host mit allen Befehlen (`host-runtime.ts:533`), der Broker leitet Befehle über die `browserId` an den besitzenden Host. `jev-goal-runner.observe` fällt von `forGoal` auf den normalen Snapshot zurück. Es fehlt nur die Oberfläche, kein Transportweg.
4. **Browser-Handoff ist kein „Needs you“.** `bootstrap.ts:781` sendet nur `browser.handoff` an die Clients. `broadcastAgentAttention` (Push, Dock, Sidebar) wird nicht ausgelöst; der Workspace-Status in der Sidebar kommt aus `deriveEffectiveWorkspaceStatus` und kennt Handoffs nicht (abgeleitet aus den Eingaben, nicht einzeln geprüft). Nur das Tab-Icon zeigt `needs_input`.
5. **Login-Verlust Apple.** Der Profil-Abgleich kopiert jede Minute Cookies in beide Richtungen inklusive Löschungen. Die Ausnahmeliste (`playwright-host.ts` und `profile-sync.ts`, zweimal gepflegt) enthält Google, YouTube und Microsoft, aber nicht Apple. Eine Apple-Anmeldung auf dem Mac wird vom Zotac-Stand überschrieben. Google-Dauerhaftigkeit über Tage ist laut Journal vom 20.10. weiterhin ungeprüft.
6. **Lag ist keine Zotac-Last.** Load 1.75 auf 16 Kernen, 27 GB frei. Der Stream schickt JPEG-Bilder mit 30 fps, 1920 px Deckel und zwei unbestätigten Bildern im Fenster; jede Eingabe ist eine Rundreise durch die serielle Befehlswarteschlange des Hosts. Die Latenz hängt am Netzpfad (Relay oder Mesh), nicht an der CPU. Nicht gemessen.

## Entscheidung

Kein Neuanfang. Broker, Hosts, Aktivitäts-Hub, Handoff, Tunnel für `localhost`-URLs und Profil-Hub existieren und funktionieren; ein Neubau verlöre Jev, Rezepte und den Profil-Hub. Es fehlen Routing und Oberflächen-Gleichstand für lokale Tabs.

Regel: **Der Browser lebt beim Menschen, Agenten erreichen ihn über den Broker.** Der Zotac-Playwright-Host bleibt für Android, Web, `browser_test`-Rezepte und für Zeiten ohne verbundene Desktop-App.

## Plan

1. Mac-Tabs wieder lokal (Rücknahme von `dd2641439`), Schalter pro Tab bleibt. Apple in beide Ausnahmelisten. **Erledigt in diesem Commit.**
2. Broker: `new_tab` bevorzugt den verbundenen Desktop-Host, sonst den Daemon. `browser_test` und Rezepte bleiben über `hostId` am Daemon. Grenze: Ist die Mac-App offen, während Marushan am Handy arbeitet, sieht das Handy Agent-Tabs nicht; Ausbaustufe ist „Host des zuletzt aktiven Clients“ über den Presence-Zustand des Websocket-Servers. Etwa 1 Stunde.
3. Lokaler Tab bekommt Schrittleiste, Handoff-Leiste und „…“-Menü: Aktivität und Handoff über `remoteBrowserId ?? browserId` schlüsseln, Leisten aus `remote-pane.tsx` in `panel.tsx` über beide Panes ziehen. Etwa 3 bis 4 Stunden.
4. Handoff und Login-Wartezeit als „Needs you“: Browser-Handoff über `broadcastAgentAttention` (Push, Dock, Sidebar-Alarm); aktiver Handoff fließt in den Workspace-Status. Trifft der Jev-Runner ein Passwortfeld ohne lokalen Slot, ruft er den Handoff mit Grund „Anmeldung nötig“ statt abzubrechen (`jev-goal-runner.ts:1243`). Etwa 3 Stunden.
5. Rollout: Mac-Oberfläche und Server-Release, geplanter Neustart nach Freigabe. Echter Lauf vom Mac: lokaler Tab, Agent liest ihn per Snapshot, Handoff erscheint als Alarm.

Nicht im Umfang: Stream-Latenz für Android. Eigene Messung Relay gegen Mesh, getrennte Aufgabe.

## Stand

- Schritt 1 (`de45dc133`): `getBrowserPaneKind` öffnet neue Electron-Tabs lokal; `apple.com` und `icloud.com` sind gerätegebunden.
- Schritt 2: `broker.selectHostForCommand` nimmt für `new_tab` den zuletzt verbundenen Desktop-Host, sonst den Daemon (`selectDesktopHost`). `browser_test`, Rezepte und der Stream bleiben über `hostId` am Daemon. Die App schreibt `localhost`-URLs beim Öffnen schon auf den Zotac um (`rewriteLoopbackUrl` in `automation/handler.ts`).
- Schritt 3: `panel.tsx` schlüsselt Aktivität, Handoff und Steuerung über `remoteBrowserId ?? browserId`; lokale Tabs zeigen damit Schrittleiste und Handoff-Leiste. Der lokale Tab hat das „…“-Menü mit Suchen (`findInPageFunction` über `executeJavaScript`), Zoom (`setZoomFactor`), Downloads, Import, Einstellungen und „Im Host-Browser öffnen“.
- Schritt 4: `BrowserActivityHub.activeHandoffs()`; `WorkspaceDirectory` zählt aktive Handoffs als `needs_input` (Sidebar, Tab, Projektzeile). `bootstrap` ruft bei neuem Handoff `notifyBrowserHandoff` (Push, Dock, In-App-Alarm wie eine Freigabe) und stößt ein Workspace-Update an. Der Jev-Runner wirft `BrowserSignInRequiredError`, sobald die Seite ein Passwortfeld zeigt und kein lokaler `env`-Slot existiert; mit Handoff-Hub übergibt er den Tab mit Grund „Sign in needed to continue“ und meldet dem Agenten `blocked` mit `handoffId`.
- Geprüft: Broker-, Runner-, Tool- und Workspace-Directory-Tests im Worktree grün (145 Tests, darunter der neue Sign-in-Handoff-Test und der umgedrehte Host-Vorrang). Typecheck und Lint laufen im Release-Build, weil der Worktree-Typecheck an `expo-two-way-audio` scheitert.
- Review (Fable-Advisor): Desktop-Snapshots (`packages/desktop/.../aria-snapshot-script.ts`) tragen keine `state`-Zeile, also kein `secret`. Auf Mac-Tabs erkennt der Runner ein Passwortfeld deshalb am Namen (`passw|kennwort|passcode`, `201daf259`); Jev hat dort keine Feldzustände und keine nativen Dropdown-Optionen, die Messwerte vom 20.10. gelten nur für Daemon-Tabs. Das Attention-Payload trägt nur die Felder, die Clients parsen.
- Grenzen: `reuseTabForOrigin` zieht einen Agenten weiter in einen offenen Zotac-Tab derselben Seite (z. B. Play Console im Stream), bis der Tab geschlossen ist oder der Agent `separateTab` setzt. „Mac-App verbunden“ ist der Stellvertreter für „Marushan am Mac“; mit offener App sieht das Handy keine Agent-Tabs.
- Folgeaufgaben: Desktop-Snapshot mit Feldzuständen (`packages/desktop`, liegt im `app.asar`, braucht den `patch-asar`-Rollout). Host-Wahl nach zuletzt aktivem Client über den Presence-Zustand des Websocket-Servers.
- 11:45 Build 3 grün (`build.log`): Lint 0 Fehler, Server-Build, Typecheck Server und App, Daemon-Web-UI, Electron-Export. Versuch 1 scheiterte an zwei oxlint-Komplexitätsgrenzen, Versuch 2 am fehlenden `BrowserHandoff`-Import (Vitest streift Typen, der Build nicht), beide behoben (`201daf259`, `42a183c40`). Keine Drift der überlagerten Dateien gegenüber der Basis. Im Release-`dist` nachgelesen: `selectDesktopHost`, `notifyBrowserHandoff`, `isSecretField`, `applyBrowserHandoffContributions`, `icloud.com`; Web-UI und Electron-Bundle enthalten das neue Menü. Chromium 1208 für Playwright 1.58.2 liegt im Cache.
- Mac-Payload liegt unter `/tmp/pandaos-browser-where-you-are/app-dist` (`index.html` SHA-256 `82a4b6c2…def8e7`, gleich dem Export) mit `install-mac.sh` (Sicherung nach `rollout-backups/browser-where-you-are-<Zeit>`, Signatur, Neustart der App). Nicht installiert.
- Offen bis zur Freigabe: `pandaos-planned-restart --release ~/.local/share/pandaos-releases/browser-where-you-are` (Dry-Run nennt 5 Sessions) und `bash /tmp/pandaos-browser-where-you-are/install-mac.sh` auf dem Mac. Danach vom Zotac prüfbar: Agent-`browser_new_tab` landet auf `hostKind "desktop app"`, Handoff setzt den Workspace auf `needs_input` und versucht den Push; Leisten, Menü und Push auf dem Mac bleiben bis zu Marushans Rückmeldung nicht bestätigt.
- Build-Skript `/home/admin/projects/pandaos/.dev/browser-where-you-are/build.sh`: Kopie des Live-Release plus alle Dateien aus `629e88917..HEAD`, Drift-Prüfung gegen die Basis, Lint, Server-Build, Typecheck, Daemon-Web-UI, Electron-Export nach `.dev/browser-where-you-are/electron`.
