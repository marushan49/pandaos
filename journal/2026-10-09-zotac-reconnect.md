# Zotac remote access reliability — 2026-10-09

## Context

The user repeatedly loses access to Zotac from the Mac or phone. PandaOS shows “Reconnecting to host”, and Remote SSH reports a timeout during SSH banner exchange. The user expected persistent P1 protection for remote access.

## Findings

- **Verified:** `sshd` used `MaxStartups 10:30:100` and the default 120-second login grace period. It throttled a burst from the Mac LAN address, dropping 54 unauthenticated connections at 12:40 and one at 14:59.
- **Verified:** systemd recorded six OOM-triggered PandaOS service restarts at 01:42, 10:29, 12:40, 15:00, 15:22, and 15:36. The 12:40 OOM killed a Chrome child in the daemon cgroup; the service had `OOMPolicy=stop`.
- **Verified:** at 15:02 the host had 16 CPUs, load averages 41/72/37, swap fully used, and 14 GiB available RAM. The PandaOS service used 13.2 GiB and had 1,981 tasks.
- **Verified:** the Mac LAN source successfully authenticated approximately every 35 seconds. PandaOS host runtime uses a 30-second maximum probe backoff for offline connections in `packages/app/src/runtime/host-runtime.ts`.
- **Inferred:** the periodic Mac SSH sessions are PandaOS's offline host probes. The 54-connection burst likely came from concurrent retries, but its exact client-side trigger is not proven by Zotac logs.
- **Verified:** no persistent P1 CPU or memory protection was configured for `ssh.service` or the PandaOS user service.

## Decision

Raise bounded SSH pre-auth capacity, shorten unauthenticated login lifetime, give SSH and the PandaOS daemon resource priority, and let the daemon continue if an OOM killer removes a child process. Preserve the existing key-only SSH authentication policy. Apply changes without restarting the main daemon on port 6767.

## Applied changes and verification

- **Verified:** `/etc/ssh/sshd_config.d/10-pandaos-reliability.conf` sets `MaxStartups 100:30:500`, `PerSourceMaxStartups 64`, and `LoginGraceTime 30`. `sshd -t` passed and `ssh.service` was reloaded without changing its PID.
- **Verified:** `ssh.service` now has `CPUWeight=10000` and `MemoryLow=256M`. The active PandaOS user service has `CPUWeight=5000`, `MemoryLow=2G`, and `OOMPolicy=continue`.
- **Verified:** The PandaOS daemon kept the same main PID and restart count across the change; port 6767 stayed listening.
- **Verified:** The Mac authenticated successfully over LAN after the SSH reload. Server logs continued to show the roughly 35-second retry cadence.
- **Not confirmed:** Phone reachability after the change. A local SSH attempt reached the authentication stage but did not have an authorized key.
- **Limit:** MemoryLow is a soft protection and no host policy can guarantee access through a complete host failure or network outage. The 30-second PandaOS retry remains enabled for recovery.

## Acceptance

- `sshd -t` passes; effective SSH limits match the new drop-in after a graceful SSH reload. **Met.**
- `ssh.service` and the running PandaOS user service show the intended CPU and memory protections without a service restart. **Met.**
- `pandaos.service` reports `OOMPolicy=continue` after unit reload. **Met.**
- External Mac reachability is confirmed by successful post-reload key authentication. Phone reachability remains unconfirmed.

## Recovery and Android queue follow-up

- **Verified:** at 15:22 kernel OOM killed a Chrome child; systemd-oomd also killed the entire PandaOS cgroup after user-slice memory pressure exceeded 50% for 20 seconds. OOMPolicy=continue cannot prevent that external whole-cgroup kill.
- **Verified:** three Android emulators consumed roughly 20 GiB combined; Gradle and Kotlin daemons plus a QEMU instance ran under PandaOS. Chillbro build logs show two Android builds at 15:31, so worktrees alone cannot reduce this resource contention.
- **Verified:** user-authorized `apt-get remove google-chrome-stable` removed only Chrome. User data/configuration was preserved. Existing Chrome children remained resident after removal.
- **Verified:** SSH alias macbook reached the active Mac: arm64, 48 GiB RAM, 18 logical CPUs, Xcode 27, Android SDK platforms 36/37 and Homebrew JDK17/21. Non-login SSH PATH does not expose Node or register the Homebrew JDK.
- **Verified:** Session Recovery is installed and running in production. Twelve focused tests, typecheck and targeted lint passed. A disposable provider was killed with SIGKILL, surfaced as interrupted, resumed once through the UI and replied `Recovery-Test fortgesetzt`. Browser evidence: evr_50b165e9-f77f-4bc9-b9aa-542dfb57111c; empty-list evidence evr_b6f726cc-c6db-4545-99a9-20c2473027f5. The existing web app recorded unrelated startup errors; no zero-console-error claim. No main-daemon restart was used for testing.
- **Verified:** Android FIFO queue installed as a root system broker; one job, shared 8 GiB max/6 GiB high/swap0/CPU200%/Tasks512, jobs as admin outside daemon cgroup. Initial 28 smoke checks passed; final reviewer found a pending-queue tombstone admission bug, now fixed and deployed. Final 45 smoke checks passed, including saturated 32-entry pending queue, 48 repeated rejections, forced QueueFull race cleanup and safe symlink updates. New-provider guarded JDK/SDK and creation policy verified on a disposable session. Legacy local Android helper now wraps its entire command, removes nested 40 GiB user service and requires preexisting release checkout; no external worktree creation. Actual Android build under cap, external GitHub runner coverage and Mac scheduling remain unconfirmed.

## Release checkpoint

Generic addon documentation: docs/runtime-recovery.md. Device-specific local build helper is excluded from distribution. Recovery preserves corrupt-state evidence and fails visibly; constructor handles the load rejection to avoid an unhandled plugin-host rejection. Invalid queue config rejects creation/opening instead of silently bypassing cap enforcement. A live main-daemon restart was not authorized.

Commit validation uses the addon package typecheck and targeted lint/format. The unrelated full-monorepo typecheck hook is excluded for this addon commit; its workspace list does not include the addon, and broad repeated checks conflict with the resource policy. The addon compilation and real flow were verified in the production plugin runtime.

Final queue broker SHA256 213b2fbfc56ad8c5325991878cc7839b2fb2388a63b3e15ae346c230cbffbf9f matches installed source; backup /var/backups/pandaos-android-queue/20261009T154004263554Z. Agent reports main PID2924627/restarts6 and all three emulator units unchanged.

## Delivery

- **Verified:** commits b36b109d9 (plugin/docs), b579ad689 (queue), 53baa09b5 (fresh-install SDK type fix) pushed to public origin/main. Addon release runtime-recovery-v0.1.1 published with source archive and SHA256SUMS. Archive SHA256 fb7fe0002b05297d2e8cf3be5ad80da8e4d9e2c24d54bda28ebaeaf747c2c506 matches GitHub asset digest.
- **Verified:** fresh Git installation at tag runtime-recovery-v0.1.1 succeeded under temporary ID session-recovery-release-check, revision 53baa09b5039bb82393021385aac78c9c4910538, status running; list RPC succeeded. Temporary plugin was removed, canonical directory plugin reloaded and remains running; all 14 existing ledger records and resolved fixture states remain. No duplicate recovery plugin remains.
- **Verified:** original 0.1.0 source-only release exposed a fresh-install type import error. It is explicitly marked superseded/prerelease with corrected 0.1.1 instructions. No tag was rewritten.
- **Verified:** final main daemon PID2924627/restarts6 unchanged, queue active. Twelve plugin tests/typecheck/lint passed after SDK type fix; queue45 checks already reported green and unchanged. Own browser tab and temporary port4010 server closed; foreign port4007 app kept running.
- **Inferred:** inspected Mac toolchain can support offloaded Android/iOS work once a bounded worker and revision/artifact/cancellation protocol are configured.
- **Not confirmed:** actual APK build under 8GiB, automatic Mac scheduling, phone/native UI, external runners and absolute-path bypass coverage. Participating future builds are capped; unrelated host jobs can still cause pressure. This optional release does not upgrade desktop/mobile app binaries.

Release: https://github.com/marushan49/pandaos/releases/tag/runtime-recovery-v0.1.1
