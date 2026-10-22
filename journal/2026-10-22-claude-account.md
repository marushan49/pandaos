# Claude accounts in provider settings

## Goal and scope

Add another independent Claude subscription account from Providers, with a name and optional account note. Preserve existing credentials. The shared account belongs on the Zotac; MacBook and Android connect to that host. User authorized merging the dialog into main and updating all three clients, then prioritized working Zotac and MacBook clients while a separate agent repairs Android builds.

## Implementation and verification

- The official CLI owns OAuth. Credentials use an independent `CLAUDE_CONFIG_DIR`; registration follows successful sign-in and cancellation removes unregistered state.
- Shared-team launches and resumes inject the agreed memory policy and disable automatic local memory. This is an instruction policy, not a sandbox or a guarantee of privacy from the provider or team administration.
- Focused service tests passed isolation, successful registration, cancellation and failure/retry. Format, lint and typecheck passed at integration. The feature commit is `2ae69e6af`, merged and pushed as `1d053917fc9304c5a02206f25af9bbc273343885`.
- Setup failed after successful OAuth because dynamic provider paths are unsupported by the config editor. The repaired script preserves the containing `agents.providers` map through the public atomic config API and skips OAuth when already authenticated. A temporary-home regression check passed; production registration then succeeded.
- After daemon activation, the existing login still reports `loggedIn=true`, `authMethod=claude.ai`, `subscriptionType=team`. Production diagnostics list `claude-team` as available.

## Rollout state

The frozen build and all rollout evidence live under `.dev/claude-account-rollout/`; `checkpoint.json` is the current task record. Build queue250 passed server, web and Electron compilation. Linux and Mac application packages were installed, hashes checked and clients reopened; the Mac signature passed strict verification. The Zotac desktop shortcut exists at `/home/admin/Desktop/PandaOS.desktop` and is executable and trusted.

The user authorized daemon restarts. The planned Zotac restart activated the account build and preserved host ID `srv_RtppvtlARpFR`. Its first automatic continuation attempt could not reach the Session Recovery plugin. A later peer-owned planned restart activated `quota-steer-fix-current`, which includes the account handler, and resumed sessions. Verified production supervisor66154/worker66165 and reachable client connection at22:18 Berlin.

Mac runtime verification passed: authenticated localhost connection, daemon99880/host`srv_Zlx3Fal_7zxE`, available providers and a valid new account-status RPC response; no additional OAuth started. Mac verification belongs to agent `1d439022-f8cc-461d-84fa-a0b6d4d5c293`; its own checkpoint is `.dev/claude-account-rollout/mac-checkpoint.json`. Android repair belongs to agent `ebf1b5a5-680a-4442-9307-0902ebd04d34` in `.worktrees/android-build`; Xiaomi was updated in job318 with exact APK hash and signer verified, existing install identity retained and restored chat visible in the viewed native screenshot. Existing native build caches must be preserved and heavy tooling must remain in the host queue.

## Delivery gate

Function: the production Providers page shows Claude Team, and its Add Claude account button opens the new form; cancellation succeeds. The automatic browser test hit an existing ambiguous generated selector, so manual takeover completed the check. Full GUI OAuth was not repeated because the actual team login is already complete.

Visual: the actual production form screenshot was viewed at1280×720, light theme, default text scale. No clipping, duplicate form title or overlapping controls was found. Evidence: `/home/admin/.pandaos/artifacts/wks_b9afbe39103ce2b7/evr_c78e57ae-304c-49fe-bc07-e2b8696314a4/screenshot.png`. Existing product styles retained; no new visual assets. Native Zotac capture was black and is unconfirmed; Mac native capture could not create an image and remains unconfirmed. No extra viewport or theme matrix was run.

Android build-workflow follow-up and its current verification limits are recorded in [Persistent Android builds](2026-10-22-android-build-workflow.md). The production Xiaomi update remains installed; the separate development-client measurement is awaiting an unlocked device.
