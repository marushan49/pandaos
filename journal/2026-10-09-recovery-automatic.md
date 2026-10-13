# Automatic recovery and visible continuation history

## Product context

PandaOS controls local coding agents across devices. Existing Session Recovery 0.1.1 provides durable checkpoints and manual recovery; users still need to type go on after crashes. Preserve the current theme, sidebar and history ownership.

## Requested outcome

Claude improves the recovery UI. New interrupted work resumes automatically, with bounded retries, and the original chat plus recovery history show the attempt, reason, time and result. Completion means a disposable provider failure automatically continues once and visible timeline evidence confirms it; normal stops and completed work remain stopped.

## Decisions

- Root owns server/shared contracts, tests, docs and integration. Claude owns client UI and timeline renderer.
- Automatic recovery is opt-in in generic installations; enabled here under this explicit user request after verification.
- Historical imported errors stay manual. Newly failed turns and durable unfinished crash checkpoints are eligible. One global automatic continuation at a time, finite budget/cooldown, permission/running/archive checks, durable deduplication and clear failures.
- Event-driven lifecycle and one owned agent subscription, no status polling or daemon restart.
- Original chat receives a persistent plugin recovery row and a visibly labeled continuation request. Recovery screen receives durable bounded history.

## Acceptance

Fresh backend/typecheck/lint/focused tests, disposable provider crash automatic continuation, exactly one submitted continuation, visible recovery/chat markers, preserved records on reload. Queue/source and unrelated app edits unchanged.

## Checkpoint 20:06 CEST

- Claude Sonnet 5.5 completed the native themed UI, automatic switch, open cases, bounded history and timeline renderer.
- Root backend: opt-in default off, three attempts across failure chains, serial automatic starts including delayed providers, explicit stop/close guard, no automatic auth/quota/context retries, immutable chat event IDs.
- 27 focused tests passed; complete plugin typecheck and targeted lint passed. No broad suites or Android builds.
- Real provider SIGKILL test 3debe26b-8c6a-4e12-9c55-d4d9598907a2 automatically received one labeled continuation and answered successfully. Durable event resumed; UI recipes panel/history/chat marker passed, zero failed requests, 2–7 unrelated console errors observed.
- Main daemon baseline this followup is PID3783153/restarts0 (changed externally since previous task); no main restart by this session. Local automatic setting enabled by explicit request; initial 18 ledger records backed up.
- Remaining: reload final code, verify retained data and exact one-message marker counts, publish addon0.2.0 and verify fresh Git install. Main app versions unchanged.

## Final validation before release

- Final code reloaded without daemon restart. Second controlled provider SIGKILL automatically continued successfully as well.
- Canonical timeline has exactly two labeled continuation requests, two unique message IDs and two terminal recovery plugin rows for two deliberate crashes; both assistant completion answers are present.
- All original 18 ledger records retained; automatic setting remains enabled. 27 focused tests, complete plugin typecheck and targeted lint green after final relevant code changes.
- Release commit is path-bound. Broad root typecheck hook excluded because this optional plugin has its own completed typecheck and host resource policy prohibits broad repeated validation; targeted format/lint hooks stay active.

## Complete

- Commit 5e54088e550ede619b4fa8f381655795eef87ea0 pushed to origin/main. Public runtime-recovery-v0.2.0 published, stable addon and latest=false, with source archive and SHA256SUMS. Archive SHA256 4f5831c36670b89dde70c6287e477cb04e88683cc3f8dba6bcd564d9c28cbae4 matches GitHub asset digest.
- Fresh Git-tag install at that revision ran successfully under session-recovery-release-check. RPC verified automatic.enabled=false on a fresh installation. Temporary installation removed; canonical SessionRecovery still running and locally enabled, two successful events retained.
- Disposable test session archived; no owned sleep processes remained. Browser tests closed their tabs. Main daemon remained PID3783153/restarts0 through this followup; no main restart or Android build performed. Queue unchanged; unrelated app/workspace and peer plugins remain uncommitted by this work.
- Done criteria met: Claude UI, bounded automatic go-on, visible history/chat proof, preserved ledger, generic release and fresh-install verification. Native mobile UI and headless immediate recovery after daemon restart remain unconfirmed; first client/session lifecycle trigger is required by documented SDK constraints.
