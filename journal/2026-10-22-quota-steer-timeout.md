# Timeout after quota recovery

## Goal

Deliver follow-up messages to the current provider turn after quota or capacity recovery without interrupting the recovered task. Preserve the logical turn identity in the timeline and existing error handling.

## Checkpoint

- Workspace: `/home/admin/projects/pandaos`, branch `main`. Existing sidebar, translations and workspace configuration edits belong to other work and remain untouched.
- Workflow: PandaOS workflow, root-cause debugging, TypeScript, targeted regression test, Anti-Slop during.
- Evidence: `startRecoveryTurn` maps provider turn IDs to the original logical ID for incoming events. Both steer entrypoints currently pass that logical ID to the provider. Codex requires its current provider turn ID and returns unavailable for the old identity.
- Scope: both manager steer callers, their shared ID translation, focused tests in the existing manager suite. No protocol, UI or timeout policy change.
- Done: regression fails before the fix and passes afterward; latest recovery ID selected; logical timeline identity retained; typecheck, lint and server build completed. Live activation requires explicit daemon restart permission.
- Regression implemented in the existing capacity/quota fixture. Initial before-fix job #253 `91c2f49e99b0483b88ec6fb88467b932` never started; canceled with exit 130 to consolidate validation. Original server source including the regression was copied unchanged to `.dev/quota-steer-baseline` before implementing the fix. Validation runs that snapshot first and requires the actual accepted/unavailable assertion failure before testing the fixed source.
- Automatic continuation registered: heartbeat `1a20cd42`, five-minute cadence, bounded to one hour. Delete when required follow-up is complete or only restart approval remains.
- Advisor `fd866825-57be-4f74-b92b-cf4be10aa3ec` in this workspace completed read-only review and confirmed the mismatch. Use a separate latest-provider-ID map rather than reversing insertion order of the incoming map: providers may reuse native IDs after switching sessions. Clear on foreground finalization, closure and new foreground dispatch. The new regression also covers fresh-turn cleanup.
- Implemented outgoing mapping in both admission operations. Latest provider ID is recorded when recovery starts, and cleared on foreground finalization, closure and fresh dispatch. Logical IDs remain in admission and timeline messages. Documented identity ownership in `docs/brain-switch.md`.
- No browser tabs or daemon restart. `.dev/quota-steer-validate.sh` batches original-source regression, fixed-source regression and nearby steer checks, one server build, one typecheck, and scoped lint in the host queue.
- Consolidated queue job #255 `4b357bee9ab24d96b36cd7214d2b2fb4`, exec session `34814`, log `.dev/quota-steer-validation.log`. Baseline config only removes its own `.dev` test exclusion; application source is the unmodified snapshot. Logs are `.dev/quota-steer-{before,after,build,typecheck,lint}.log`.
- First consolidated job #255 failed in test setup before reaching steering: a fixed clock advance did not allow async provider session creation to finish. Replaced that assumption with `vi.waitFor` on the held provider turn, copied only the corrected test into the unchanged baseline source.
- Retried consolidated job #259 `2fb1034dfb74426285d9205b00d14995`, exec session `14920`. Baseline now fails for the intended assertion (`unavailable` instead of `accepted`). Fixed source passes all four selected tests, covering both steer entrypoints after quota switch and multiple capacity recoveries, no interrupt, retained logical timeline IDs, fresh-turn cleanup, normal accepted steering and intentional unavailable-steer replacement.
- Server/CLI stack build and monorepo typecheck passed in #259. Scoped lint caught a shadowed fixture parameter; renamed it to `steerOptions`. Only final scoped lint, server typecheck and four selected tests need repeating; production source and its built artifact are unchanged.
- Release skeleton prepared at `/home/admin/.local/share/pandaos-releases/quota-steer-fix` from the active release. Original manager source SHA-256 matches the baseline; only the owning class and source/docs will be replaced after validation. Release files share immutable hardlinks; unlink every changed destination before copying. Proof: `.dev/quota-steer-release.json`.
- Final job #262 `01e59ea203c94e0ab29a7ff4e0929fe9`, exec session `54379`, completed with exit 0. Scoped lint has zero errors/warnings; final server typecheck and all four selected tests pass. Production source was unchanged after the successful server build; only the fixture parameter was renamed.
- Candidate is patched with the built manager JS, declarations and maps plus owning source/test/docs. Exact hashes match root output, the active release remained unchanged, and the existing web UI was preserved. `node --check` passed on the candidate manager JS. Manifest: `.dev/quota-steer-release.json`.
- `pandaos-planned-restart --dry-run` passed; evidence `.dev/quota-steer-restart-preview.log`. No notifications sent and no restart performed.
- Heartbeat `1a20cd42` deleted successfully after all automated work completed. No queue jobs or browser tabs remain for this task; advisor session remains open. Waiting solely for planned-restart approval.
- Implementation and approved activation complete. Active release: `/home/admin/.local/share/pandaos-releases/quota-steer-fix-current`. No further restart or build required.

## Delivery gate

- Functional verification: PASS. Baseline reproduces the accepted/unavailable mismatch; four focused tests pass on corrected source, including both steer entrypoints, repeated recovery, retained logical IDs, no unwanted interrupts, fresh-turn cleanup and existing normal steer/replacement behavior.
- Build, typecheck and lint: PASS. Server/CLI stack built once, monorepo typecheck passed, final server typecheck and scoped lint passed after fixture-only naming correction. Candidate built output hashes and syntax verified.
- UI/visual, layout, colors, assets and copy: not applicable; no UI changes.
- No fabricated verification or new explanatory code comments.
- Live activation: PASS. Retry1 finished successfully at 2026-10-22T20:16:22Z; daemon active/running with PID66141, original server identity preserved, active target correct, all candidate file hashes match and the preserved web UI bundle is served. Evidence `.dev/quota-steer-activation-proof.json` and the planned-restart log.
- The exact timeout in the user's original live session was not replayed. The regression demonstrates the concrete provider-turn mismatch rather than asserting that every possible 60-second RPC timeout has been eliminated.

## Authorized activation

User explicitly answered “Ja, geplant aktivieren”. The live release had moved to `/home/admin/projects/pandaos/.dev/claude-account-rollout/source` while approval was pending. Its manager source still exactly matched the original regression baseline. Recreated candidate `/home/admin/.local/share/pandaos-releases/quota-steer-fix-current` from that current release and copied only the previously verified owning files. Current UI and account changes are preserved; file hashes and candidate JS syntax passed again. No build repetition was needed.

Planned restart run ID: `quota-steer-fix-20261022`. Command: `pandaos-planned-restart --release /home/admin/.local/share/pandaos-releases/quota-steer-fix-current --run-id quota-steer-fix-20261022`. Log: `/home/admin/.pandaos/planned-restart/quota-steer-fix-20261022.log`.

Post-restart verification heartbeat `81aecde3` registered for up to 20 minutes. No own queue jobs, helper processes or browser tabs. Advisor session `fd866825-57be-4f74-b92b-cf4be10aa3ec` remains open. On checkpoint notification answer `STATUS: watching` and preserve this checkpoint; after restart verify active target, server identity, web bundle and compiled manager SHA in `.dev/quota-steer-release.json`, then delete the heartbeat and mark complete. Never duplicate the planned restart.

### Restart retry after missing addon configuration

First planned run exited 1 before sending checkpoints or switching the release: `Plugin is not available: session-recovery`. The intervening rollout retained only Mail Breeze in root plugin config. Prior enabled Session Recovery entry is documented in `config.json.rea.backup`, and its durable records still exist under `/home/admin/.pandaos/plugin-settings/session-recovery/data/turns.json`.

Restored that same previously trusted local source through `pandaos plugin install /home/admin/projects/pandaos/plugin-examples/session-recovery --id session-recovery --json`; running status verified. Existing records and automatic setting, Mail Breeze configuration and global plugin setting were preserved. Private backup files `.dev/quota-steer-config-before-recovery.json` and `.dev/quota-steer-recovery-before.json` must not be exposed or committed. Evidence `.dev/quota-steer-recovery-restore.log`; dry run now passes and would checkpoint 13 sessions.

Current planned run: `quota-steer-fix-20261022-retry1`, log `/home/admin/.pandaos/planned-restart/quota-steer-fix-20261022-retry1.log`. User's activation approval still applies. Old heartbeat `81aecde3` deleted; active verification heartbeat `8d15e913`, bounded to 20 minutes. No own queue jobs, helper processes or browser tabs; advisor stays open. Do not rerun the first failed unit or duplicate retry1. Resume verification from the manifest and retry1 log.

### Completion

Retry1 completed and resumed the recorded working/watching sessions, including this agent. Post-restart verification passed against the real daemon: active service and release, original serverId, exact compiled manager hash, all candidate owning files and served web bundle. Heartbeat `8d15e913` deleted successfully. No own background jobs, queue jobs or browser tabs remain. Agent sessions remain visible. Task complete; other possible timeout causes were not audited.
