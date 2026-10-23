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

It fingerprints dependency, native and source files against the last build of the same project and variant (`~/.cache/pandaos-android-update/`). `up-to-date` skips the build. `js-only` and `native` run the incremental Gradle task. `dependency` reruns `npm ci` when the lockfile changed and `expo prebuild --clean` for Expo. It never runs `clean` unless asked.

Installation picks the only connected physical device or requires `--device`, compares the package, refuses an older `versionCode` without `--allow-downgrade` and refuses a different signing certificate, because that update would require uninstalling and lose app data. It uses `adb install -r` and reports whether `firstInstallTime` stayed unchanged. Play-delivered APKs with a v3.2 PQC signer cannot be fully verified by `apksigner` on JDK 21; the certificate comparison reads the v2/v3 signing block directly.

PandaOS itself uses its own persistent builder, see [Android](../../docs/android.md).

## Optional Mac development worker

Zotac remains the default. `--worker NAME` selects an enabled SSH worker inside the
existing scheduler. Priorities, job IDs, cancellation, output, reconnects and
history keep using the same queue and local systemd job. No worker daemon or
second queue runs on the Mac.

Merge a worker entry into `/etc/pandaos-build-scheduler/config.json` only when
activation is coordinated with the scheduler owner. This example is configuration,
not an installed or tested development checkout:

```json
{
  "workers": {
    "macbook": {
      "enabled": true,
      "ssh": "macbook",
      "node": "/usr/local/bin/node",
      "path_maps": [{ "local": "/home/admin/projects", "remote": "/Users/mau/projects" }],
      "env": { "PATH": "/usr/local/bin:/usr/bin:/bin" },
      "memory_budget_gib": 4,
      "reserve_memory_gib": 4,
      "max_cores": 2,
      "max_running": 1
    }
  }
}
```

The SSH alias belongs to the configured scheduler user. The configured Mac SSH
account is trusted with the same user authority as local queued commands. Node
must already exist on that host. No packages, source, credentials or environment files are copied.
Only CI, NODE_ENV, TERM, LANG, LC_ALL, TZ and EXPO_NO_TELEMETRY are forwarded.
The worker keeps its native HOME, Java and Android environment; put required
native tool paths in its explicit `env` configuration. Caller PATH and SDK paths
never cross hosts.

One root mapping covers every project below it. The remote source and its
dependencies must already exist. The working directory, absolute argv paths and
`--option=/absolute/path` values use the longest matching root mapping. `/bin`
and `/usr/bin` executables use the host-native path. Paths inside shell strings,
embedded options such as `-I/path`, relative scripts and generated artifacts are interpreted on the worker; there
is no automatic source sync, artifact download or network tunnel. A Mac Metro
server additionally needs a prepared checkout and a reachable device URL.

```bash
pandaos-build-scheduler --worker macbook worker-probe
pandaos-android-queue --worker macbook --priority interactive -- node script.mjs
pandaos-build-scheduler --json status
pandaos-build-scheduler cancel JOB
```

Probes run only for explicit requests or queued/running worker jobs, with bounded
SSH timeouts and a ten-second cache. The scheduler reserves memory and cores per
host; unavailable workers defer their own jobs without moving them to Zotac.
Each worker shares one bounded background probe. Scheduling and reaping never
wait for SSH; an explicit `worker-probe` request waits for that same task.
Remote admission uses free/reclaimable memory and system load. Mac memory and CPU
measurements sample the process group once per second, so they can miss short
peaks and exited children. Mac CPU admission is a reservation, not a hard cgroup
quota; macOS cannot provide the Linux cgroup guarantees. The memory watchdog
stops a group exceeding the existing job memory limit after a sample.

Timeouts, disconnects and cancellation terminate the job's process group, with
SIGKILL after one second. Loss of the SSH input lease stops it within about ten
seconds plus sampling/kill delay. Commands must stay in that process group and
must not launch detached services. The local transport remains in the existing
build slice and keeps its current limits. A scheduler restart preserves the
local systemd wrapper and normal adoption; do not replace helper files while
jobs are starting. This change does not implement a live configuration reload.

Focused verification, through the existing host queue:

```bash
pandaos-android-queue --priority blocking -- python3 scripts/build-scheduler/smoke.py --optional-worker
```

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
```

The smoke check covers exit codes, separate streams, missing executables, nested calls, parallel start, build-directory locks, SIGTERM, killed clients, runtime limits, detached jobs with log replay, scheduler restart with reattach, and legacy status. It starts no Android build and runs on a live scheduler.
