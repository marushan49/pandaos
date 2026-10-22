# 2026-10-22 Dropping sessions on a project, and the workspace's own tab

## Goal

1. Dragging a workspace row or a tab puts its sessions exactly where they were dropped. A drop on a workspace row or one of its session rows lands in that workspace. A drop on a project (header or free area of the block) creates a new workspace in that project. Nothing lands under the project's first workspace by accident.
2. The tab row shows which tab is the workspace's own session and which tabs were added later.

## Change

- `bb45ff607` `sidebar-session-rows.tsx`: session rows carry their workspace's drop target. They sat beside the workspace row's target, so a drop on one fell through to the project block and landed in the project's first workspace.
- `1b5e7e3b4` `workspace-move/`, `sidebar-workspace-list.tsx`, `split-container.tsx`: a project block carries a project drop target (`data-project-drop-target`, JSON with server, project, root folder and name) when the project can host another workspace (the existing `new_workspace` gate). A drop there creates a local workspace (`source.kind: "directory"`, the project root) titled after the dragged workspace or session, adds it to the store, then moves the sessions. Projects without that gate keep the old first-workspace target.
- Drop rules: a workspace row dropped on its own project stays a reorder; a tab dropped on its own project splits off into a new workspace; an empty workspace dropped on a project does nothing. Confirm and toast texts are reused with the project name.
- Local, not worktree: the replaced first workspace is normally the main checkout, so the sessions' folder is the same as before; only the workspace changes. Sessions that change folder restart there, as before.
- `e022b40f3` daemon: moving a session sets the label `pandaos.workspace.joined-at`, in both move branches (same folder, and relaunch in the new folder).
- `82396c0a3`, `274a40487`, `7a0d7468b` app: the workspace's own session is the root session that joined it first (the label, else its creation time). Before, the oldest session won, so an older session moved in took over the workspace row and pushed the real one down as a session row. The sidebar and the tab row use the same rule. Its tab moves to the front when the workspace opens and stays first when other tabs move to the front (after a move, after a finished turn). In the desktop tab row a 1px `border` line follows it, centered in an extra `spacing[2]` gap that the tab width calculation reserves.
- Known limits: sessions moved before the daemon update have no label and keep the creation-time rule. The compact tab switcher shows no divider. If the user drags another tab before the own tab, the divider follows the own tab, and reopening the workspace, the next move or a finished turn puts it back in front.
- `use-workspace-sessions-drop.test.ts` failed before this change at import (`react-i18next` mock without `initReactI18next`); it now mocks partially.

## Verification

- Lint 0 errors, app and server typecheck green. Tests: `src/workspace-move` and `workspace-agent-activity` 24/24, `agent-manager.test.ts` move cases 2/2.
- Drop build: release copy `~/.local/share/pandaos-releases/dnd-project-drop` = `sidebar-child-card` plus the seven app files, no drift (`.dev/dnd-project-drop/build.sh`, queue job `e8610292…` #15). Web export served on `127.0.0.1:4007` (an allowed origin) against the live daemon.
- Host browser: `browser_test` failed with "Chromium sandboxing failed". Google Chrome was removed on 09.10, and the reboot at 02:04 brought back Ubuntu's userns restriction for the Playwright Chromium. Added the AppArmor profile `/etc/apparmor.d/playwright-chromium` (that binary path only, `unconfined` plus `userns`, like Ubuntu's `chrome` profile).
- Drop flows in the Zotac host browser, project view, fixtures in `/tmp/pandaos-dnd`, each checked with a viewed screenshot:
  - Workspace row on another project's header: "DnD Quelle 2" became the new workspace `wks_ec93715a7f0333e3` in beta, at the top; the chat shows "Moved to /tmp/pandaos-dnd/beta". Passed (`evr_35b8aa48…`).
  - Workspace row on a session row of a workspace that is not the first: "DnD Quelle 1" landed in "DnD Ziel 2", not in the first workspace. Passed (`evr_e2a2382b…`).
  - Tab on its own project header: "DnD Agent Z2b" became the new workspace `wks_8a8ce7773fb48e17`; the project block showed the valid highlight during the drag; toast "DnD Agent Z2b → beta". Passed (`evr_2b084b92…`).
  - Reorder inside a project: order changed, 0 move prompts, no move. Passed.
- Tab row, release copy `~/.local/share/pandaos-releases/dnd-main-tab` (`sidebar-child-card` plus the files of `bb45ff607..7a0d7468b`; `workspace-screen.tsx` patched instead of copied because the release carries the Android panel delay; server built; queue jobs `e5155067…` #29, `384cd54e…` #30, `d2b489b1…` #33). The live daemon does not set the label yet, so it was set by hand on Q1 (moved into "DnD Ziel 2" before Z2a's tab existed there). Light theme, default text size:
  - First version: the line sat on a half pixel and was nearly invisible next to the active tab (`.dev/dnd-main-tab/tabs-zoom-v1.png`). Fixed in `7a0d7468b`.
  - Opening "DnD Ziel 2": tab row became "DnD Agent Z2a │ DnD Agent Q1", sidebar shows Q1 as the session row under the workspace. 1280×720, line crisp in the `border` color, centered (`evr_69d00db5…`, zoom `tabs-zoom-v2.png`). Passed.
  - Tab of Z2b dragged onto "DnD Ziel 2": "Z2a │ Z2b (active), Q1", the moved tab lands right after the own tab (`evr_7d624c48…`). Passed.
  - 820×640: three tabs, divider, + button and overflow fit, nothing clipped (`evr_a6bb3955…`). Passed.
  - Not checked: dark theme, large text, compact tab switcher (no divider there by design), the daemon label end to end (needs the planned restart).
- Cleanup: six fixture workspaces archived with their five agents, projects alpha and beta deleted, `/tmp/pandaos-dnd` removed, test server on 4007 stopped, verification tab closed.

## Rollout

- Pushed `bb45ff607..7a0d7468b` to `origin/main`.
- Mac payload staged at `/tmp/pandaos-dnd-main-tab` on the Mac (tarball `d28ea70d…`, `index.html` `35dba487…`), `install-mac.sh` guards the installed `index.html` `3783d002…` (message row build). It also brings the indented session highlight, which was never installed.
- Daemon: `pandaos-planned-restart --release ~/.local/share/pandaos-releases/dnd-main-tab`, dry run asks six sessions first.
- Both wait for Marushan's go.
