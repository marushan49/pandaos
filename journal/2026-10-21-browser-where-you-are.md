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

- Schritt 1 umgesetzt: `getBrowserPaneKind` öffnet neue Electron-Tabs lokal; `apple.com` und `icloud.com` sind gerätegebunden. Gezielte Tests folgen im Commit.
