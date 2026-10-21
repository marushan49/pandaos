# 2026-10-21 Messages between sessions like Claude Desktop

## Goal

When one session sends a message to another session, also across workspaces, the receiving chat shows it the way Claude Desktop does: "Received message from" plus the sender session title and a chevron, body collapsed, the receiver's reply below.

## Findings from Claude Desktop (REA, static read)

Target: `/Applications/Claude.app` 3.1623.0, `app.asar` sha256 prefix `760e7cbb6f861f0b` (same as the Mac). The Code tab is the claude.ai web bundle captured in `/tmp/rea-claude-desktop/web/js`. Static reading only, no runtime observation.

- `c44e562e8-*.js`: a received message is a timeline event of kind `code.peer_received`, rendered standalone and counted separately from tool groups. Clicking the subject runs action `receivedSender` with the sender `sessionId`.
- `c63275c0a-BdsoXo8C.js`, `Wh`: label = `{verb, subject}`. Verb is "Received message from" (subagents: "Message from"), subject is the sender session title, fallback "another session".
- Same file, `eg`: the row is collapsed by default (`peer:<itemId>` state), the subject is a link only when the sender session is known and is not the current session. Toggle label "Show/Hide message from {sender}".
- Same file, `Hh`: one line, muted verb (`shrink-0`), primary subject (`truncate`), trailing chevron; body below as plain pre-wrapped text in the primary color.

## Before

PandaOS drew the message as a tool call ("Message from X", bot icon). Between tool calls it folded into a "Worked for …, ran N commands" group and disappeared.

## Change

- `a7b4cce4c` `AgentMessageRow` (`packages/app/src/components/agent-message-row.tsx`): muted verb, sender title, chevron, body collapsed. Title falls back to the live session title, then "another session". Title opens the sender session through `navigateToAgent`, also in another workspace. Notification events use "Session finished/failed/needs permission/closed" as the verb. Strings in all 9 locales.
- Agent messages never fold into tool-call groups (`grouping.ts`, test in `projection.test.ts`, fails without the fix).
- `a27d890b1` pressing the sender title does not toggle the row.

## Verification

- Function: test session `aadc1e1d` "Test: Nachricht zwischen Workspaces" in workspace "Reply with OK" (`wks_3c9b61e597ef6522`) got two messages from this session (`wks_14286c854d119eac`). Web export against the live daemon via proxy `127.0.0.1:43234`. `browser_test` pass, 0 console errors (`evr_22f44a03…`). Expand shows the body, title click moved to `wks_14286c854d119eac`. Passed.
- Visual: 1280×720 collapsed (`evr_53a769ec…`), expanded (`evr_5a758f66…`), 390×800 expanded (`evr_4f7b7171…`), default text size. Long title truncates with an ellipsis, chevron stays visible, nothing overflows. Passed.
- Not checked: notification events (`finished`, `errored`, …) in the UI, native iOS/Android, large system font.
- The first reply of the test session is missing because the second message interrupted its first turn (default `activeTurnBehavior: "interrupt"`), unrelated to this change.

## Limits

- No German locale exists, so the app shows "Received message from", not "Nachricht erhalten von".
- Sending side unchanged: the sender still sees `send_agent_prompt` as a tool call.

## Rollout

- Release `~/.local/share/pandaos-releases/agent-message-row`: live `activity-sessions` plus the app files from `5637811b2..a27d890b1`, no code drift, lint, app typecheck, daemon web UI, Electron export (`.dev/agent-message-row/build.sh`, `build.log`).
- Mac payload staged at `/tmp/pandaos-agent-message-row` on the Mac (`index.html` `3783d002…`, tarball `742e7fea…`), installer with backup, re-sign and rollback. Mac still on `6860e983…`. Not installed: it quits and reopens PandaOS, so it waits for Marushan's go. No daemon restart needed for the Mac app.
