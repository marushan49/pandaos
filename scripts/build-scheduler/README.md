# Build scheduler

`pandaos-build-scheduler` runs heavy build, test and tooling commands for every agent on a Linux host. It replaces the single-slot [Android queue](../android-queue/README.md) and keeps its entry points: `pandaos-android-queue`, the Java/Gradle guard and the SDK emulator facade now submit to this scheduler.

Jobs run in parallel when measured memory, CPU and pressure allow it. Each job is a transient system service in `pandaos.slice/pandaos-build.slice`, outside the agent daemon's cgroup.

## Use

```sh
pandaos-build-scheduler -- ./gradlew assembleDebug
pandaos-build-scheduler --priority blocking -- cargo test -p michelin
pandaos-build-scheduler --priority interactive -- adb install -r app.apk
pandaos-build-scheduler status            # human view, --json for scripts
pandaos-build-scheduler logs JOB          # replay output of a job
pandaos-build-scheduler attach JOB        # take over a detached job
pandaos-build-scheduler cancel JOB        # id or sequence number
pandaos-build-scheduler report 1          # last day: waits, run times, cache reuse
```

`pandaos-android-queue` accepts the same arguments; its `status` prints JSON and lists remaining jobs of the old broker under `legacy_jobs`.

Options: `--timeout` (max 2 h), `--queue-timeout` (max 1 h), `--priority interactive|blocking|normal|background`, `--class light|medium|heavy`, `--detach`, `--label`. Exit codes match the old queue: the command's status, 124 for queue or runtime limit, 125 for scheduler errors, 127 for a missing executable, 130 for cancellation.

Submit the complete command. A nested `pandaos-build-scheduler` or guarded `java` inside a job runs directly in that job.

## Admission

Every second the scheduler measures `MemAvailable`, CPU usage outside build jobs, CPU and memory PSI, and each job's cgroup (`memory.current`, `memory.peak`, `cpu.stat`, `io.stat`). A queued job starts when all of these hold:

| Check           | Rule                                                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build directory | No other non-light job holds the same lock: the git worktree, or `CARGO_TARGET_DIR` for Cargo                                                      |
| Count           | At most `max_running` jobs; light jobs get `light_backfill` extra slots                                                                            |
| Fairness        | An agent with `max_per_agent` running jobs waits while other agents wait                                                                           |
| Starvation      | A non-light job waiting longer than `starvation_seconds`, or an interactive one waiting a minute, reserves capacity: only light jobs may pass it   |
| Heavy jobs      | At most `max_heavy` at once                                                                                                                        |
| Memory          | Estimate fits into `MemAvailable` minus `reserve_memory_gib` minus the growth still expected from running jobs, and into `build_memory_budget_gib` |
| Pressure        | Memory PSI and CPU PSI below their thresholds, light jobs are exempt from the softer limit                                                         |
| CPU             | Estimated cores fit into `cores − reserve_cores − non-build usage`, multiplied by `cpu_overcommit` while CPU PSI is low                            |

With nothing running, a job only needs enough memory. Priorities age one level every `aging_seconds`. Running jobs are never preempted.

Estimates start from a heuristic over the command and the script it runs, then switch to the job signature's measured history: peak memory × 1.2 + 0.25 GiB and the p90 of average cores. The measured class (`heavy` from 3 GiB or 3.5 cores, `light` below 1 GiB, 1.5 cores and 3 minutes) replaces the heuristic class. `status` shows the class source.

CPU estimates of a fresh job count for 20 seconds, then its measured usage counts. Memory always counts the larger of estimate and current use.

## Limits

| Scope             | Limit                                                                                  | Reason                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Slice             | `MemoryHigh=30G`, `MemoryMax=32G`, `MemorySwapMax=0`, `CPUQuota=1200%`, `CPUWeight=30` | 62 GiB host with about 25 GiB used by agents; builds never use swap and lose CPU contention against agents |
| Job               | `MemoryHigh` ≥ 6 GiB (1.5 × estimate), `MemoryMax=12G`, no swap, `TasksMax=4096`       | Never stricter than the old queue (6/8 GiB); the largest measured job peaked at 11.0 GiB                   |
| Job               | `CPUWeight`/`IOWeight` 400/200/100/25 by priority, `Nice=5`                            | Interactive work wins within the build slice                                                               |
| Scheduler service | 512 MiB, 50 % CPU                                                                      |                                                                                                            |

Defaults live in `scheduler.py`; `/etc/pandaos-build-scheduler/config.json` overrides any key. Change limits only after measuring with `report`.

## Caches

Jobs keep the account's `HOME`, so `~/.gradle`, `~/.cargo`, `~/.npm` and `~/.pub-cache` are shared across worktrees and sessions. The worker adds:

- ccache settings (`CCACHE_BASEDIR=$HOME`, no hashed directory). React Native's CMake uses ccache automatically when it is installed.
- `RUSTC_WRAPPER=sccache` with a per-job server port when the caller did not set a wrapper. The server stops with the job.
- For Gradle started through the Java guard: build cache, `workers` and JVM arguments from the `gradle` config key.

`~/.gradle/gradle.properties` enables the build cache and disables the daemon for every Gradle run on the host. Configuration cache stays off because React Native/Expo plugins are not compatible.

The scheduler serializes jobs that write the same worktree or Cargo target directory. Separate worktrees build in parallel and share the caches above.

## Android updates

`pandaos-android-update` builds and installs Gradle, Expo and Flutter projects through the scheduler:

```sh
pandaos-android-update classify --project android
pandaos-android-update build --project android --variant debug
pandaos-android-update install app/build/outputs/apk/debug/app-debug.apk --package app.example
pandaos-android-update update --project . --variant release --device SERIAL
```

It fingerprints dependency, native and source files against the last build of the same project and variant (`~/.cache/pandaos-android-update/`). `up-to-date` skips the build. `js-only` and `native` run the incremental Gradle task. For debug builds of Expo and Flutter projects, a source-only change does not build: the installed debug app picks it up through Metro/Fast Refresh or Flutter Hot Reload; `--apk` builds anyway. `dependency` reruns `npm ci` when the lockfile changed and `expo prebuild --clean` for Expo. It never runs `clean` unless asked.

Installation picks the only connected physical device or requires `--device`, compares the package, refuses an older `versionCode` without `--allow-downgrade` and refuses a different signing certificate, because that update would require uninstalling and lose app data. It uses `adb install -r` and reports whether `firstInstallTime` stayed unchanged. Play-delivered APKs with a v3.2 PQC signer cannot be fully verified by `apksigner` on JDK 21; the certificate comparison reads the v2/v3 signing block directly.

PandaOS itself uses its own persistent builder, see [Android](../../docs/android.md).

## Remote workers

The Zotac stays the controller. A remote worker such as the MacBook runs jobs over SSH; the job keeps its ID, output, cancellation, history and local systemd unit on the Zotac. No daemon or second queue runs on the worker. The worker is optional: when it is off, asleep or unreachable, every compatible job runs on the Zotac.

Configure workers in `/etc/pandaos-build-scheduler/config.json`:

```json
{
  "auto_placement": false,
  "workers": {
    "macbook": {
      "enabled": false,
      "ssh": "macbook",
      "node": "/usr/local/bin/node",
      "path_maps": [{ "local": "/home/admin/projects", "remote": "/Users/mau/projects" }],
      "snapshot_root": "/Users/mau/.pandaos-worker/snapshots",
      "env": {},
      "memory_budget_gib": 16,
      "reserve_memory_gib": 8,
      "max_cores": 8,
      "max_running": 2,
      "speed_factor": 0.8,
      "battery_min_percent": 50,
      "active_idle_seconds": 120
    }
  }
}
```

`ssh` is an alias of the scheduler account's `~/.ssh/config`. Android builds need JDK 17 and 21 on the worker: the MacBook has Temurin builds in `~/.pandaos-worker/jdk-17` and `jdk-21` (Android Studio's JBR is Java 25, which Gradle 8 rejects), listed in its `~/.gradle/gradle.properties` as `org.gradle.java.installations.paths` because toolchain detection runs in the forked build JVM and ignores `GRADLE_OPTS`. iOS signing needs the Mac login keychain unlocked; `pandaos-ios-release` checks it first and stops with exit 75. Leave `env` empty: the worker sets `JAVA_HOME` from Android Studio's JBR, `ANDROID_HOME`, Homebrew and Cargo paths itself. Only `CI`, `NODE_ENV`, `TERM`, `LANG`, `LC_ALL`, `TZ` and `EXPO_NO_TELEMETRY` cross hosts; caller credentials, tokens and SDK paths never do.

### Placement

`--worker local` (default) pins the Zotac, `--worker NAME` pins a worker, `--worker auto` lets the scheduler choose. With `auto_placement: true`, medium and heavy jobs in a git project become `auto` when they fetch their own dependencies: pure Gradle projects without a `package.json` at the project root, Flutter and iOS. Node and Expo jobs stay on the Zotac because snapshots carry no `node_modules`; pin `--worker` only when the worker already has them. iOS commands (`xcodebuild`, `xcrun`, `pod install`, `flutter build ios|ipa`, `expo run:ios`, `fastlane ios`) never run on Linux. Without an enabled worker they are rejected; with one they become `auto` and wait while the Mac is offline, busy or protected, up to their `--queue-timeout` (24 h maximum). A permanent obstacle (no git project, missing tool, no `snapshot_root`) ends the job at once with the reason. Commands that reach the Mac themselves through `ssh` stay local.

For each candidate the scheduler checks platform, the toolchains the command needs (reported by the worker probe), whether the project can be copied as a snapshot, and admission. Light jobs stay local. Then it estimates completion time as expected wait + snapshot sync + build time + artifact transfer. Build time comes from the job's history on that worker; without history it is the Zotac estimate × `speed_factor`, × 1.5 until the worker built the project once. A remote worker wins only if it is at least 15 % faster than an available Zotac, so a warm Zotac keeps its builds. The binding happens when the job starts; a running job never moves. The `placed` decision records every candidate with its estimate or blocking reason.

The MacBook is protected:

| State                              | Effect                                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Battery power                      | Only iOS jobs, and only from `battery_min_percent`                                                                            |
| Input within `active_idle_seconds` | No background heavy jobs; interactive and blocking jobs still run                                                             |
| Load and free memory               | Reported by the probe, admission like on the Zotac with `memory_budget_gib`, `reserve_memory_gib`, `max_cores`, `max_running` |

macOS has no cgroups: CPU admission is a reservation and memory is sampled once per second; a job above the memory limit is stopped.

### Snapshots and artifacts

Before a remote job starts, the job copies the project worktree with rsync into `snapshot_root/<project>-<hash>`, including uncommitted and untracked files. `.git`, `.gitignore` entries, `node_modules`, `build`, `.gradle`, `.cxx`, `Pods`, `DerivedData`, `target`, `.dart_tool`, keystores, provisioning profiles, `.env` files, `key.properties` and `local.properties` stay on the Zotac. Platform outputs and dependencies therefore stay separate per host and stay warm between runs. Each worktree gets its own snapshot; the scheduler serializes jobs on the same snapshot. Builds that need signing material or `npm ci` must find them on the worker.

`--artifact PATH` (project-relative, repeatable) copies results back into `jobs/<id>/out/artifacts/` after a successful run; `status --json` lists them under `cache.artifacts`.

If the SSH connection breaks, the worker's lease expires and it kills the job's process group; the Zotac job ends with 125 and is not retried.

```bash
pandaos-build-scheduler workers
pandaos-build-scheduler --worker macbook worker-probe
pandaos-build-scheduler --worker auto --artifact app/build/outputs/apk/debug/app-debug.apk -- ./gradlew assembleDebug
```

## Store releases

Both tools use the project's existing credentials and never print them.

```bash
pandaos-play-release status --package app.example --credentials ~/.config/example/play-service-account.json
pandaos-play-release verify app/build/outputs/bundle/release/app-release.aab
pandaos-play-release release --project android --package app.example --credentials … --track internal --notes notes.txt
pandaos-play-release upload app-release.aab --package app.example --credentials … --track alpha --notes notes.txt --commit
```

`release` runs `testDebugUnitTest` and `:app:bundleRelease` through the scheduler, then `upload`. `verify` reads package, `versionCode` and `versionName` from the bundle manifest, checks the JAR signature and refuses the Android debug key. `upload` refuses a `versionCode` that any track or bundle already uses and names the next free one. Without `--commit` it uploads into a Play edit, updates the track, calls `validate` and discards the edit: nothing is published. `--commit` publishes to `internal`, `alpha` or `beta` and reads the track back. `production` needs `--allow-production`, is always created as a draft and needs the owner's approval. `--evidence FILE` records method, path and status of each API call.

```bash
pandaos-ios-release status --bundle-id app.example --asc-env ~/.config/example/asc.env
pandaos-ios-release build --project ios --scheme App --asc-env … --test-destination "platform=iOS Simulator,name=iPhone 17"
```

`status` lists the newest App Store Connect builds and App Store versions. `build` submits one iOS job (`--worker auto`, waits up to 24 h for a macOS worker): `xcodegen` or `pod install` when the project uses them, optional tests, an unsigned archive and `-exportArchive` with cloud signing through the App Store Connect key in `~/.appstoreconnect/private_keys` on the Mac. By default the export destination is `export` and the IPA comes back as an artifact. `--upload --confirm-upload` switches the destination to `upload` and sends the build to App Store Connect; use it only after the owner approved it. `--dry-run` prints the job without starting it.

## Recovery

State lives in `/var/lib/pandaos-build-scheduler`: `state.json` for queued and running jobs, `history.jsonl` for measurements, `decisions.jsonl` for every queue, start, deferral and finish with its reason and the capacity snapshot, and `jobs/<id>/` for output. Output is kept for a day; the request file containing the environment is deleted when the job ends.

Job units are not bound to the scheduler service. Restarting the scheduler keeps running jobs, restores queued ones, and clients reattach and continue streaming without duplicate output. A client that disappears for longer than `client_grace_seconds` cancels its job unless it was submitted with `--detach`.

## Install, switch, roll back

```sh
sudo -n python3 scripts/build-scheduler/install.py            # install or update, restarts only the scheduler
sudo -n python3 scripts/build-scheduler/install.py --switch   # route pandaos-android-queue and guards here
sudo -n python3 scripts/build-scheduler/install.py --rollback # restore the single-slot broker entry points
```

The legacy queue must be installed first; it provides the JDK/SDK facades and `agent-env.json`. Every install copies replaced files to `/var/backups/pandaos-build-scheduler/<timestamp>/`. Updating the scheduler while jobs run is safe.

## Verify

```sh
python3 scripts/build-scheduler/smoke.py
pandaos-android-queue --priority blocking -- python3 scripts/build-scheduler/smoke.py --optional-worker
python3 -B scripts/build-scheduler/placement_tests.py
```

The smoke check covers exit codes, separate streams, missing executables, nested calls, parallel start, build-directory locks, SIGTERM, killed clients, runtime limits, detached jobs with log replay, scheduler restart with reattach, and legacy status. It starts no Android build and runs on a live scheduler.
