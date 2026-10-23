---
title: Browser automation
description: Give agents a real browser inside Paseo to open pages, click, type, and verify their work.
nav: Overview
order: 35
category: Browser
---

# Browser automation

Agents in Paseo can drive real browser tabs — the same tabs you see in the Paseo desktop app. An agent can open your dev server, read the page, click through a flow, fill a form, and take a screenshot, all without leaving your machine.

This closes the loop on frontend work: instead of telling you "the change should work," an agent opens the page and checks.

Typical uses:

- **Verify its own changes.** After editing a component, the agent opens the dev server, snapshots the page, and confirms the new text or layout is actually there.
- **Reproduce and diagnose bugs.** Click the exact sequence from a bug report, then read the console and network logs.
- **Exercise full flows.** Forms, multi-step wizards, hover menus, drag and drop, file uploads.
- **Work in logged-in sessions.** Tabs keep their session state. When a page needs your login, the agent hands you the tab; sign in once and it works behind the login.

Because you share the browser with the agent, you can watch it work, step in at any point, and take over the steps only you can do.

## Enabling

Browser tools are off by default. Turn them on per host:

- **In the app:** open **Settings → your host → Browser** and turn on **Browser tools**.
- **In `config.json`** (`~/.paseo/config.json`):

```json
{
  "daemon": {
    "browserTools": {
      "enabled": true
    }
  }
}
```

The tools are part of the [Paseo MCP toolset](/docs/mcp), so **Enable Paseo tools** on the same page must also be on for agents to receive them. Existing agents may need a reload to pick up new tools.

> Browser tools let agents access and control Paseo browser tabs, including logged-in browser state. Only enable this for agents you trust.

## Where a tab lives

The browser runs where you are. In the desktop app, new tabs and tabs an agent opens use the app's own browser; the agent reaches them through the daemon, so typing and scrolling are local and Chrome's own prompts stay visible. The page menu can move a tab to the host stream, and tabs moved there stay there. Android and the web client use tabs hosted by the daemon on the workspace machine, shown as a remote viewport with forwarded clicks, keyboard input, scrolling, hover, and long-press drags. `browser_test` recipes always run in the daemon's browser. A tab the desktop app hosts is not visible on the phone. Handoff changes who controls input; the page and profile stay on the tab's host before, during, and after it.

Sign-in cookies for Google, YouTube, Microsoft and Apple stay on the device that signed in; the profile sync carries every other site between the desktop app and the host.

## Import and backup

In **Settings → your host → Browser**, each detected profile identifies its source device
and destination. Current hosts import cookies and saved passwords into the displayed host
browser, including profiles read by the Mac desktop app. Older hosts need an update for
password import; their desktop fallback uses the separate Electron profile. Close the source
browser first. Chromium imports require that profile's original Safe Storage key; Firefox
imports use its NSS key database and optional Primary Password. Firefox needs Python 3 and
an installed Firefox/NSS library on the source device.

Imported passwords are stored encrypted. On the host, clicking or tabbing into an empty password field in
a top-level form offers the matching username's credential for that exact origin. A single
saved account can fill an empty username; multiple accounts require a matching username.
Settings list the displayed profile's saved accounts and let you remove them. Agent browser
commands cannot trigger vault autofill. Credentials never appear in import replies or browser-tool metadata.

**Encrypted browser backup** saves the displayed profile's cookies and saved passwords to
a local file from the desktop app. Use a separate passphrase of at least 12 characters.
Restore authenticates the whole file before changing the profile, adds missing entries,
and preserves existing cookies and credentials. A wrong passphrase or damaged file leaves
the profile unchanged. Site sessions can expire or be revoked independently of the backup.
Session cookies are also checkpointed with OS encryption for a normal app/host shutdown;
this does not promise recovery after forced process termination.

A Chromium keyring error means encrypted source values could not be decrypted with the
original key. On macOS, unlock the login keychain and allow the source browser's Safe Storage
entry. On Linux, install `libsecret-tools` when `secret-tool` is missing, unlock the original
keyring, and run the daemon in that user's desktop D-Bus session. Creating a new keyring
cannot decrypt the old profile. Do not delete or replace the original key or browser data.
The importer refuses incomplete decryption rather than claiming a successful login import.
Encrypted snapshots remain untouched when their key cannot be unlocked.

Google's [OAuth policy](https://developers.google.com/identity/protocols/oauth2/policies)
restricts embedded user agents. Current hosts use ordinary Chrome pages; the Electron
fallback may still be rejected. Google login and Play Console require separate Mac acceptance.
An **Open in browser** action opens the current full URL. It does not transfer session cookies
between the host and the external browser. OAuth popups stay in the host context with their
opener; canceling a handoff returns control without closing its tab.

## Taking control of a tab

While a `browser_goal` or `browser_test` run drives a tab, a status bar above the viewport shows the step, the phase, the chosen action with its accessibility target, and Jev's confidence; the browser tab shows a running dot. A recipe also shows its next step. Jev chooses its next step only after it looks at the page again, so a goal run shows **Re-check page** until it has chosen. Tap the bar for the step overview. Your input to the viewport is blocked during a run. **Take over** pauses the run after the current action and hands input back to you; **Resume** continues from a fresh snapshot of the page as you left it. The status stream carries only structured action data: no screenshots, filled values, or model reasoning.

When an agent reaches a step only you can do — a login, a 2FA code, a CAPTCHA, a payment — it calls `browser_handoff` instead of asking for credentials in chat, and ends its turn. `browser_goal` hands the tab over by itself when the page shows a password field that no local credential slot covers. A handoff alerts like a permission request: a push notification, the needs-you mark on the workspace in the sidebar and on the tab. The chat shows a card with the agent's reason and **Open browser**, which opens the tab; on a phone it switches the view to the tab. A banner above the viewport repeats the reason. Until you press **Done** or **Cancel** there, the tab is yours: the agent cannot read or drive it, and every browser tool on it, including `browser_goal` and `browser_test` steps, returns an error. Done or Cancel sends the agent a message with the tab's current URL and title, shown as a note in the chat, and the card shows how the handoff ended. Closing the tab cancels the handoff.

## How an agent sees a page

The primary tool is `browser_snapshot`, which returns the page as an accessibility tree — headings, text, form state, and hierarchy — instead of raw HTML:

```yaml
- document "Settings"
  - heading "Workspace" [level=1]
  - text: "Connected as Maya"
  - textbox "Display name" [ref=@e2]
  - button "Save changes" [ref=@e3]
```

Interactive elements carry refs like `@e3`. The agent passes a ref to `browser_click`, `browser_fill`, and the other action tools. Refs come from the latest snapshot of that tab and expire when the page changes — a stale ref returns an error instead of acting on the wrong element.

For anything the tree can't capture, agents fall back to `browser_screenshot`, and `browser_logs` exposes console messages and network timing.

## Fast goal loops with Jev

`browser_goal` embeds the DOM reader and indexed operation/target policy from [Jev Ultrafast](https://github.com/browser-use/jev-ultrafast), pinned to `1231850a0bf1a0c0341fe408ef1668dbbfdfac46`. Jev receives visible text, current field and checkbox states, and available native dropdown choices. Operation and compatible target heads share one TypeSafe request. Only the chosen operation's target can execute. The existing host validates page/form state, node identity and click coverage before input; a changed target requires a fresh observation. Normal `browser_snapshot` and manual browser commands keep their existing behavior.

The calling coding agent supplies exact public field text as `values.query = { "text": "Vienna to Graz", "description": "route search field" }`. It serves the text-generation role from the upstream architecture, without an additional model key or model call per field. Public text can enter the tool transcript and Jev request. Passwords and other credentials must use local `env` slots. The same slots work in recipe `goal` steps. Native dropdowns use observed options; a field already containing its supplied value is skipped.

Saved scripted recipes run without a model. Other goals use the compact Jev loop. A goal that would pass without any browser action costs one Jev call that classifies it: a goal that only inspects the page passes, a goal that asks for a change returns `uncertain`. Text that was already on the page, for example in a chat transcript, does not show that the change happened. Pick `verify` text that appears only after the goal. If Jev is unavailable or remains unsure, the result preserves the tab and completed-action trace for the calling agent to continue with normal snapshots and browser tools, including screenshots. The agent keeps its configured provider and permissions. A compact-reader failure falls back to the existing snapshot reader. Invalid decisions can be re-observed twice before takeover; an action with an uncertain execution result is not automatically submitted again.

The bounded loop stops only after every required text or URL check passes. It sends no screenshots in the decision loop. The host retains its browser profile, handoffs, activity bar and input execution. The upstream demo, Python process and separate Chrome session are not started. Source adaptations and license are recorded in [the source notice](../packages/server/src/server/verify/jev-ultrafast.md). This integration does not establish a general speedup; measure representative flows before making performance claims.

Configure and enable Jev under **Settings → your host → System One**. Paseo stores a key entered there in a host-local `0600` file; it can also use `TYPESAFE_API_KEY` or `~/.config/typesafe-ai/env` as a fallback. Form values use environment-variable references so credentials do not enter the tool transcript or the TypeSafe request:

```json
{
  "goal": "Sign in with the test account and reach the dashboard",
  "url": "http://localhost:3000/login",
  "values": {
    "email": { "env": "E2E_EMAIL", "description": "test account email" },
    "password": { "env": "E2E_PASSWORD", "description": "test account password" }
  },
  "verify": [{ "text": "Dashboard" }, { "url": "/dashboard" }]
}
```

Low-confidence decisions stop without mutating the page. Stale refs trigger a new observation and decision, never a blind retry of the previous browser action.

The same System One setup also gives every supported coding agent the general `system_one_decide` tool. See [System One](/docs/system-one) for when agents use Jev outside the browser.

## Testing engine

`browser_test` is the tool agents use for every UI or end-to-end check. The daemon runs the steps itself and returns only the verdict: pass or fail, the checks, console and network error counts, and an evidence reference for the screenshots. The page never enters the agent's context, so a test costs a small fraction of the tokens of driving `browser_*` tools by hand.

A failed run keeps its tab open and returns `browserId` so the agent can inspect it and continue. A passing run closes only a tab created for that verification after saving its screenshot and evidence. Reused tabs stay open. See [tab lifecycle](../docs/agent-lifecycle.md#archive) for the session and preview rules.

Save recurring flows as recipes in the workspace's `pandaos.json`:

```json
{
  "verification": {
    "recipes": {
      "settings-smoke": {
        "steps": [
          { "action": "navigate", "service": "web", "path": "/settings" },
          {
            "action": "goal",
            "goal": "Open the browser settings",
            "verify": [{ "text": "Start page" }]
          },
          { "action": "assert-console-errors", "max": 0 },
          { "action": "screenshot", "name": "settings" }
        ]
      }
    }
  }
}
```

Scripted steps (`navigate`, `click`, `fill`, `wait-text`, `assert-visible`, `assert-text`, `assert-console-errors`, `assert-failed-requests`, `screenshot`, `ensure-authenticated`) run without any model. A `goal` step hands the part you cannot script to Jev and passes only when its `verify` checks hold and, if no action ran, the goal only inspects the page; it needs System One. Agents call `browser_test` with no arguments to list recipes, with `recipe` to run one, or with `steps` for an ad-hoc run; adding `saveAs` stores a passing ad-hoc run as a recipe in `pandaos.json`, so the next run needs no model at all. While browser tools are enabled, Paseo hides other browser MCP servers (Playwright, Puppeteer, Chrome DevTools, Browser MCP, Browser Use) from its Claude, Codex, and OpenCode agents so every test goes through the engine.

## Architecture

```
agent ──MCP──▶ daemon (broker) ──▶ persistent browser (workspace host)
                                      ▲
                         app viewport + input RPC
```

- **Workspace-scoped tabs.** An agent only sees and controls tabs in its own workspace. New tabs open in the background without stealing your focus.
- **Persistent profiles.** The daemon stores browser profiles below its Paseo home, so cookies, local storage, and logins stay on the workspace host.
- **Tab-to-host routing.** The daemon browser owns new tabs when available and keeps tab commands on that host. `browser_list_tabs` still aggregates connected hosts for compatibility.
- **Trusted input.** Clicks, keys, hovers, scrolls, and drags are dispatched as real browser input events — CSS `:hover` triggers, and pages can't tell an agent's click from a user's. Ref-based actions first wait for their target to be visible, enabled, and stable.
- **Dialogs never block.** `alert` is accepted; `confirm`, `prompt`, and `beforeunload` are dismissed. Every handled dialog is reported in the tool result so the agent knows the page flow changed.

## Security

- Navigation is restricted to `http(s)` URLs.
- File uploads can only reference files inside the agent's workspace.
- Tabs share the browser profile you use in Paseo, including cookies and logins — that's what makes logged-in testing work, and why the feature is opt-in per host.
- Sign in inside the remote tab to keep the session on the workspace host. The browser uses a dedicated Chrome profile with its normal security settings. A Linux host needs `xvfb` and `xauth` for its private virtual display. Run the daemon as a non-root user with Chrome sandbox support; Paseo does not disable the sandbox when launch fails. Identity providers can still apply their own account and browser checks. **Open in device browser** opens a separate session.
- `browser_goal` sends the goal, visible page text, element labels, non-sensitive field states, and executed action metadata to TypeSafe. Passwords, recognized payment fields and one-time-code fields have no value in the goal snapshot. It does not send screenshots or values loaded from the `values` environment-variable map.

See the [tools reference](/docs/browser-tools) for the full tool list.
