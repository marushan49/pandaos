# 2026-10-22 Highlight of nested session rows

## Goal

A session row under its workspace (with the └ tree line) shows its selected and hovered card from the indent on, not from the sidebar edge. The accent bar sits at the card's left edge, the tree line stays visible left of the card. Rows that are not indented stay unchanged.

## Change

- `3b178321c` `packages/app/src/components/sidebar/sidebar-session-rows.tsx`: the tree rail moved out of the `Pressable` into the row container, which carries the indent. The card starts right of the rail, its left padding keeps the title at the same x as before. The elbow runs to the rail's right edge, so it meets the accent bar. Workspace rows are untouched.
- The tap and hover target of a session row now starts at the card, the rail area left of it is no longer pressable.

## Verification

- Lint 0 errors, app typecheck (`tsgo`) green, Electron and plain web export in release copy `~/.local/share/pandaos-releases/sidebar-child-card` (`agent-message-row` plus this file, no drift), queue #2109, `.dev/sidebar-child-card/build.log`.
- Function: web export against the live daemon through the origin proxy (`127.0.0.1:43241`, before build on `43240`). `browser_test` pass, 0 console errors (`evr_8fcebb66…`). Selecting the child session "Zoom mit Cmd + und Cmd - in PandaOS" highlights only that card. Passed.
- Visual, light theme, default text size: 1280×720 before (`.dev/sidebar-child-card/before-1280.png`) and after (`after-1280.png`, zoom `compare-1280-zoom.png`); 390×800 after (`after-390.png`, `after-390-zoom.png`). Child card begins right of the └ line, bar at its edge, elbow meets the bar, title truncates with an ellipsis, nothing overflows. Selected workspace row unchanged. Passed.
- Not checked: dark theme on the Mac (layout is theme independent), hover state, native iOS/Android, large system font.

## Rollout

- Mac payload staged at `/tmp/pandaos-sidebar-child-card` on the Mac: `app-dist` from the Electron export (`index.html` `2d6806e1…`, tarball `f9a1bbe7…`), built on the message row renderer so that feature stays. `install-mac.sh` from the message row rollout with two guards: the installed `index.html` must be `3783d002…` and the payload `2d6806e1…`. `app.asar` (zoom fix) is not touched.
- Install waits for Marushan's go: `bash /tmp/pandaos-sidebar-child-card/install-mac.sh` on the Mac quits and reopens PandaOS.
