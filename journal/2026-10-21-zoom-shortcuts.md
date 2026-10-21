# 2026-10-21 Zoom shortcuts on the Mac

## Goal

In the Mac desktop app Cmd + and Cmd = zoom in, Cmd - zooms out, Cmd 0 resets to 100 %.

## Cause

The View menu in `packages/desktop/src/features/menu.ts` already had Zoom In, Zoom Out and Actual Size, but Zoom In only listened to `CmdOrCtrl+=`. The Mac uses the German layout (`KeyboardLayout Name = German`), where the `+` key never produces `=`, so Cmd + did nothing. Cmd - and Cmd 0 were already bound. No renderer shortcut uses `-`, `=` or `0` (`parseDigit` only accepts 1 to 9), and the shortcut recorder turns the zoom items off while it records and on again on every exit path.

## Change

- Zoom In shows `CmdOrCtrl+Plus` (Cmd + on German, Cmd Shift = on US). A hidden second item keeps `CmdOrCtrl+=` (Cmd = on US, Cmd Shift 0 on German). Both are off while a shortcut is being recorded.
- Zoom stays on the window, not the Electron browser tab, as before. Nothing persists the zoom level across restarts.
- Web in a browser: no change, the browser handles Cmd + / - / 0 itself.
- Removed the two explanatory comments in `menu.ts`. Their content: the recorder disables the zoom accelerators so Cmd - / Cmd = reach the renderer, and the main process clears the recording flag when a window finishes loading because a reload mid-recording never sends `false`.

## Checks

- `npm run build:main` (tsc) and `npm run lint -- packages/desktop/src/features/menu.ts` passed (queue #2103).
- Real Electron 44.2.0 under Xvfb on the Zotac, loading the compiled `dist/features/menu.js` (`.dev/zoom-shortcuts/run.sh`, queue #2106). Keys Ctrl Shift =, Ctrl =, Ctrl =, Ctrl -, Ctrl 0 gave zoom levels 0.5, 1, 1.5, 1, 0. Screenshots `.dev/zoom-shortcuts/out/shot-*.png` looked at: text larger after zoom in, `innerWidth` back to 900 after reset. Passed.
- Not checked: the German-layout key match on macOS. Linux matches accelerators differently, and SSH has no screen capture on the Mac. Marushan presses the keys after the install.

## Rollout

- Mac payload `/tmp/pandaos-zoom-shortcuts` on the Mac: installed `app.asar` with only `dist/features/menu.js` replaced (`.dev/browser-client/tools/patch-asar.cjs`, 11777 packed files compared, 1 changed), new `app.asar` `bca23f26…`, header hash `61d78868…` for `ElectronAsarIntegrity`. The Mac `menu.js` was identical to the build before this change, so no other main-process code comes along.
- `install-mac.sh` installs this together with the waiting message row (`/tmp/pandaos-agent-message-row/app-dist`, `index.html` `3783d002…`). It checks all three hashes, backs up `app.asar`, `Info.plist` and `app-dist`, signs once, quits and reopens PandaOS, and rolls back on error.
- 21.10. 23:46 installed after Marushan's go: `app.asar` `bca23f26…`, `ElectronAsarIntegrity` `61d78868…`, `app-dist/index.html` `3783d002…`, `codesign --verify` ok, PandaOS and its renderer process running. Backup `rollout-backups/zoom-shortcuts-20261021-234646`. The keypress on the Mac is Marushan's check.
