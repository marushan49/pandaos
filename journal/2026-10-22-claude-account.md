# Claude accounts in provider settings

## Goal and scope

Add another Claude subscription account from Providers without editing JSON or entering commands. Accept a name and optional account note, including shared team-account context. Preserve existing credentials and accounts. Do not change quota-routing policy or impersonate a user's sign-in.

## Evidence and decisions

- Verified: provider aliases already support labels, descriptions and independent `CLAUDE_CONFIG_DIR`; provider configuration is hot-reloaded.
- Verified: installed `claude auth login --claudeai` with piped input prints an HTTPS Claude OAuth URL and accepts a returned code. Isolated probe cancelled and temporary directory removed.
- Use the official CLI sign-in, not a custom OAuth implementation. Store an account only after successful CLI completion; cancellation removes the unregistered directory.
- Existing account-description field owns notes. Show it in provider settings and allow editing after creation.
- Design read: focused host-settings task using existing form, button and sheet primitives, ENERGY 1 / RHYTHM 1 / MOTION 1. Preserve product typography/colors/spacing; primary sign-in action is the focal point, no new visual assets.
- Worktree: `/home/admin/projects/pandaos/.worktrees/claude-account`, branch `feat/claude-account`, workspace `wks_63a399a170b090df`. Main has unrelated sidebar changes.

## Completion criteria

1. Providers opens the account form with name and optional note.
2. Sign-in presents the official link and code entry; success adds a selectable independent provider, failure remains visible, cancel cleans up.
3. Account note remains visible and editable.
4. Build, typecheck/lint and one targeted browser flow, with actually viewed screenshot; focused service tests cover credential isolation and cancellation because a real team-account sign-in requires the user.

## Checkpoint

Implemented official CLI sign-in, scoped management RPC, settings form, account notes, and shared-team policy. User clarified: shared login also used by Timo; configure the account only on Zotac, no Mac changes; allow work on other projects but no persistent memory for non-9elf26 projects. Shared-team profile injects the policy into each Claude launch/resume and disables local automatic memory. This is not a security sandbox, transcript deletion or a guarantee against Anthropic/organization access.

Focused service tests: 3 passed, real subprocess and temporary filesystem, checking isolation, registration after success, cancellation and failure/retry. Early builds found a wrong executable-resolution import; corrected to the actual `src/executable-resolution` path. Installation queue224 (`974b338f01704b618abc9ac28cecb86cb86` as initial log prefix; canonical job id in `/tmp/pandaos-claude-account-install.log`) completed. Build230 failed on the now-corrected import. Final build/check pending after scope change. No daemon restart or publication authorized. No team login created yet.

Privacy sources verified 2026-10-22: Anthropic Privacy Center `who-owns-and-manages-the-data-of-my-team`, official Claude Code Remote Control docs, and Enterprise Compliance local-session transcript docs. Local histories are host-specific; same-login use and team controls do not guarantee secrecy. Account/device sessions in the user's screenshot are login entries, not coding transcripts.

## Delivery gate

Account setup remains pending the user's official sign-in. Native devices unverified. GUI implementation is not delivered or rolled out: both exports failed at the host's existing heap cap, so its browser and visual gates remain unverified. No UI PASS is claimed.

## Resumed checkpoint

Recovered existing worktree after provider switch. No team login, preview daemon or browser tab existed. Fixed six concrete lint findings and retained the previously fixed spinner color. Targeted lint passed on all 17 changed code files. App typecheck passed in queue job #234 after postinstall patches. Queue job #238 (`3f42eb7952f14a70aa9f9f31bd5d1f98`) built the server, passed server typechecks and five targeted tests, then failed during Expo export at the existing 2 GiB Node heap limit. Log: `/tmp/pandaos-claude-account-verified-build.log`. No host limit was raised.

Advisor `b8652f91-f9e7-47e9-aea4-c88e29add78c` finished a bounded read-only review. Addressed both important findings: verify `claude auth status --json` in the isolated directory before registering, and inject descriptions only for profiles explicitly carrying accountPolicy. Signal-exit cleanup also corrected. Official installed CLI help confirms `auth status --json` exists. The full real OAuth code exchange remains unverified; earlier wording about accepting a returned code described the exposed stdin flow, not a completed real login.

Moved the account form lifecycle into a plain TypeScript model plus a mechanical React hook, as required by `docs/forms.md`. Retry preserves entered account details; an additional test checks cancellation if the sheet closes during startup. New service test rejects exit-zero without authenticated status. Queue #240 stopped at a wrong type import before export; corrected to the existing `@getpaseo/client/internal/daemon-client` export. Current exec session 63773 logs to `/tmp/pandaos-claude-account-bounded-build-2.log`; typecheck, focused tests and one lower-memory single-worker unminified export, under unchanged limits.

Heartbeat `12411566` is the bounded recovery reminder; delete after the build finishes. Prior heartbeat `5e82ec1b` was deleted. The first isolated preview PID3868181 was stopped because its default speech setup began downloading models; 12 KiB of temporary model state only. Configure dictation/voice disabled before restarting that preview. No preview remains running; no browser tabs or real login yet. Next: local preview, browser flow and viewed screenshot, then actual Zotac login. Production restart still requires permission; no Mac changes.

## Current route: existing provider configuration

The corrected app typecheck, server build, four login service tests and two form tests passed. Queue #242 (`2ba2e731ed5d47939c1ae0bb0439ce5a`) also failed Expo export at the unchanged 2 GiB heap cap, even with one worker and no minification. No further export retry or limit increase. Logs: `/tmp/pandaos-claude-account-bounded-final.log`. The bounded-build heartbeat `12411566` was deleted. Final preview PID3915406 was stopped; port6783 closed. GUI work stays uncommitted on feat/claude-account.

The user's requested account can use the already-supported provider aliases without rolling out new app code or restarting PandaOS. Installed only on Zotac: `/home/admin/.local/share/pandaos/providers/claude-team/{AGENTS.md,launch.py,setup.py,check.py}`. Credential directory `/home/admin/.pandaos/provider-accounts/claude-team`, mode0700. The launcher clears inherited authentication sources, disables automatic memory, and appends the team policy on fresh start and resume while preserving existing system prompts. Only explicitly requested company memory is allowed; private project and Second Brain/Agent Status memories are prohibited by instruction. It also instructs global/project AGENTS discovery despite the isolated profile having no copied hooks.

Delivery evidence for this configuration route: saved assert self-check `check.py` passed prompt preservation, resume, auth-command passthrough, isolated env and memory override; Python compilation passed; the actual launcher returned installed Claude version2.1.296. These are launcher checks, not a real authenticated agent run or a guarantee that every model follows instructions. Actual OAuth and provider diagnostic remain pending.

Official sign-in is running in PandaOS terminal `7ffc4051-e4f3-43f7-85a5-15fff014f1bd`, name **Claude Team anmelden (Zotac)**. User must sign in with the shared team account and paste the returned code there. `setup.py` validates `loggedIn` before writing provider `claude-team` via supported `pandaos daemon config set`, then reloads configuration without restarting. Existing login is preserved. It writes only a nonsecret result marker `setup-result.json` and sends a completion notification to this parent agent for verification. Auth timeout15minutes. A one-shot recovery heartbeat is registered for the timeout boundary. No Mac action was performed. Do not repeat account writes or sign-in on continuation; read the result marker first.

## Authorized integration and rollout (21:08 Berlin)

User authorized merging the account dialog into main, building the resulting main and updating Zotac, Mac and Android. This continuation is owned by session152810f3-6860-4af0-b093-99045e0816f4; previous session checkpoint is waiting and its last activity is the completed sign-in handoff. Current main and feature base are4965a9733. Preserve main's uncommitted sidebar work. No daemon restart authorized yet.

Verified: existing isolated team login returns loggedIn=true, authMethod=claude.ai, subscriptionType=team. Setup failed after login because providers.claude-team is an invalid persisted config path; even agents.providers.claude-team is rejected for a dynamic key. An isolated temporary-home reproduction confirms this, with no production config writes. Registration remains pending; no repeat login is needed. Mac reachable, installed app PID60137. No active queue jobs. GUI build attempts238/242 failed at the existing heap limit; no blind repeat or raised host limit.

Pending: commit and merge the feature, build once with the established host recipe, verify the real account dialog with browser_test and a viewed image, stage safe platform updates, then obtain the required daemon-restart approval. Existing account credentials must remain untouched.
