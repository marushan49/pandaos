# Android tooling queue

Install this standalone Linux queue beside PandaOS or Paseo. It requires Python 3.10+, systemd 249+ with unified cgroup v2, an installed JDK and Android SDK, and root permission for installation. It has no npm dependencies and does not restart the agent daemon.

The root broker accepts commands from one configured Unix account over a local socket. It runs each command as that account in a transient **system** service. Every queued job shares `/pandaos.slice/pandaos-android.slice`, outside the agent daemon's user cgroup. Admission order is FIFO and one job runs at a time.

## Install

Pass the actual toolchain directories, before sourcing the queue environment:

```sh
sudo -n python3 scripts/android-queue/install.py \
  --user "$USER" \
  --java-home /path/to/installed/jdk \
  --android-home /path/to/installed/android-sdk
```

Install separately on each Linux build host. This installer does not support macOS.

The installer creates these paths:

| Path                                                  | Purpose                                              |
| ----------------------------------------------------- | ---------------------------------------------------- |
| `/usr/local/bin/pandaos-android-queue`                | Blocking CLI                                         |
| `/usr/local/lib/pandaos-android-queue/`               | Broker, guards, JDK/SDK facades, shell environment   |
| `/etc/pandaos-android-queue/config.json`              | Configured account and real tool paths               |
| `/etc/pandaos-android-queue/agent-env.json`           | Environment for future agent sessions                |
| `/etc/pandaos-android-queue/service.env`              | Broker account setting                               |
| `/etc/systemd/system/pandaos-android-queue.service`   | Enabled broker service                               |
| `/etc/systemd/system/pandaos-android.slice`           | Shared resource limits                               |
| `/run/pandaos-android-queue/`                         | Socket and temporary private job requests            |
| `/var/backups/pandaos-android-queue/<UTC timestamp>/` | Copies of replaced configuration and installed files |
| `<configured account home>/.gradle/gradle.properties` | Defaults for future Gradle invocations               |

Backups preserve file contents and modes; restore ownership when restoring the account's Gradle properties. No vendor executable is renamed or patched. Facades contain symlinks to the original toolchain and guards at the Java and emulator entry points.

The installer refuses to update a running broker. Drain its jobs, stop **only** `pandaos-android-queue.service`, and rerun the installer to update it. It does not modify the PandaOS/Paseo service, existing emulator units, shell startup files, or project source. Installation runs system unit validation and starts only the new queue service.

## Run and cancel

```sh
. /usr/local/lib/pandaos-android-queue/env.sh
pandaos-android-queue -- npm run android:production
pandaos-android-queue --timeout 3600 --queue-timeout 1800 -- ./gradlew assembleRelease
pandaos-android-queue status
pandaos-android-queue cancel JOB_ID
```

Submit a complete Android command, including Expo/prebuild or EAS local builds, to cover Node, Hermes, native compilers, Java, and any emulator it starts. Existing emulators can be reused. A foreground emulator submitted alone holds the single queue slot until it exits or reaches its runtime bound. Descendants of a completed job are cleaned up, so Metro or an emulator started inside a queued build does not become a persistent background service.

The CLI streams stdout and stderr separately and returns the command's exit code. Queue messages on stderr include the job ID and admission sequence. `cancel` waits for cleanup and returns the job's final exit status; canceled jobs return 130. A client receiving SIGTERM returns 143 after requesting cancellation. A killed or disconnected client causes its job to be canceled; jobs are never replayed automatically.

Queue wait expiration returns 124. Runtime expiration returns 124, or the terminating signal's exit status if systemd terminates the job first. Broker/request failures return 125; missing executables return 127. Jobs receive no interactive stdin or TTY. Use noninteractive build commands and accepted SDK licenses. Status retains at most 128 completed job summaries in memory; output and environment are not retained there. Broker restart drops history, cleans its own previous job units, and disconnected clients receive an error.

## Limits and cleanup

| Resource                          | Shared slice and each job |
| --------------------------------- | ------------------------- |
| Memory high / hard maximum        | 6 GiB / 8 GiB             |
| Swap maximum                      | 0                         |
| CPU quota / weight / process nice | 200% / 20 / 10            |
| Tasks maximum                     | 512                       |
| Concurrent jobs / pending queue   | 1 / at most 32            |
| Runtime / queue wait maximum      | 2 hours / 1 hour          |
| Request / argv bound              | 1 MiB / 4096 arguments    |

The broker has a separate 256 MiB, zero-swap, 25% CPU, 64-task limit in `system.slice`. Socket permissions and `SO_PEERCRED` restrict access to the configured UID and root; jobs always execute as the configured account. Root-owned request files are readable by that account's group and deleted after execution. They contain the submitted environment, so they are never emitted to logs or included in status output.

Cancellation stops the exact job unit. `KillMode=control-group`, `TimeoutStopSec=5s`, and `SendSIGKILL=yes` cover detached descendants too. Systemctl interactions have 15-second bounds; the broker refuses another job if cleanup leaves its previous unit active. Broker stop/restart also cleans only its prefixed transient units. It never kills jobs by a process-name pattern.

This isolates future participating builds; it does not move existing Gradle/Kotlin processes or emulators. It cannot prevent host pressure caused by other cgroups. An Android build exceeding the 8 GiB hard cap fails within the queue instead of using the daemon's memory budget. This policy does not depend on `ManagedOOMPreference`: the installed system slice was verified root-owned, and no preference xattr is used.

Future Gradle defaults disable persistent daemons and parallel builds, set one worker, use a 3 GiB heap with 768 MiB metaspace and two active processors, and run Kotlin compilation in-process. The Java guard also supplies those Gradle launcher system properties. Explicit Gradle command-line options, custom `GRADLE_USER_HOME`, or another JDK can override defaults; the cgroup cap still applies to commands already inside the queue.

## Integration before session_open

Read `/etc/pandaos-android-queue/agent-env.json` on the **host where the provider CLI will run**. Before forwarding `agent.session_open`, merge its values into the provider environment and prepend these directories to the existing PATH:

```text
<PANDAOS_ANDROID_QUEUE_BIN>:<JAVA_HOME>/bin:<existing PATH>
```

The installed JSON exposes:

```json
{
  "JAVA_HOME": "/usr/local/lib/pandaos-android-queue/jdk",
  "ANDROID_HOME": "/usr/local/lib/pandaos-android-queue/sdk",
  "ANDROID_SDK_ROOT": "/usr/local/lib/pandaos-android-queue/sdk",
  "PANDAOS_ANDROID_QUEUE_BIN": "/usr/local/lib/pandaos-android-queue/bin"
}
```

Inject the Android command policy when agents are created: submit the entire Android build/tooling command through `pandaos-android-queue`, preserve the injected toolchain environment, reuse running emulators, and avoid launching tooling through a different systemd unit. Apply both creation policy and session-open environment to every provider and future agent, including resumed sessions and subagents. Existing provider processes keep their old environment until reopened. The queue installation alone does not install this lifecycle hook; the companion recovery integration owns it.

Nested queue calls execute directly only after verifying the process's `/proc/self/cgroup` belongs to a system queue job. Setting `PANDAOS_ANDROID_QUEUE_ACTIVE=1` cannot bypass this check. Java/SDK guards restore the actual JDK/SDK for the queued executable, preventing recursive launches and preserving native toolchain lookup.

## Enforcement coverage and remaining bypasses

| Launch path                                                                    | Coverage with the injected environment                                                                           |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `pandaos-android-queue -- COMMAND`                                             | Complete command and descendants, with shared limits                                                             |
| `./gradlew` using `$JAVA_HOME/bin/java`                                        | Java/Gradle invocation queued by JDK facade                                                                      |
| `java`, `gradle`, `sdkmanager`, `avdmanager`, `emulator` through injected PATH | Guards queue installed executables; absent standalone Gradle reports an error and directs callers to `./gradlew` |
| `$ANDROID_HOME/emulator/emulator`                                              | SDK facade guard, including Expo's SDK-relative emulator lookup                                                  |
| SDK manager's own `JAVA_HOME/bin/java`                                         | Java guard catches JVM tooling even via SDK-relative scripts                                                     |

The following paths remain explicit bypasses unless the **whole caller** is queued:

1. A real absolute Java/JDK path or resetting `JAVA_HOME`/PATH through mise, a shell startup file, IDE configuration, `env -i`, or a custom wrapper.
2. A real absolute SDK path, a project's `local.properties` pointing to the real SDK, or an independently located QEMU binary. The facade's `emulator/qemu` remains a symlink to the real directory; invoking its binaries directly also bypasses the entry guard.
3. Node/Expo prebuild, Hermes, CMake/Ninja, native compiler and Kotlin commands launched outside a queued complete command. A Java guard covers only the JVM subtree, not its Node parent. SDK `adb`, `aapt2`, `apksigner`, `javac`, and other unguarded executables are also not individually wrapped. Existing adb servers are preserved.
4. Explicit `systemd-run --user`, another service/scope, containers, privileged cgroup moves, SSH/offload, and the self-hosted GitHub Android runner. These launch independently and need their own complete-command queue integration on that host.
5. Existing provider processes, Gradle/Kotlin daemons and emulator services retain their environment and cgroups. Legacy build helpers must wrap their complete command and remove nested unit launches that leave the queue slice.

This is cooperative entry-point enforcement for future agents, not a security boundary against a user deliberately launching a different executable or cgroup. Do not claim all host Android tooling is isolated until the session hook, command policy, legacy helper, and runner integrations are installed and checked individually.

## Verification

```sh
python3 scripts/android-queue/smoke.py
```

The focused smoke checks use short shell/Python tasks, Java `-version`, and emulator `-version`. They start no AVD and build no Android application. They require an idle queue, cancel only their own jobs, and remove their temporary files.

The initial Linux verification passed 45 focused checks: FIFO without overlap, root-owned shared/per-job limits, job user identity, stdout/stderr and exit status, explicit cancellation, SIGTERM, client disconnection, detached descendants, queue/runtime bounds, nested queue calls, missing executables, JDK facade execution and SDK-relative emulator execution. Regression checks fill all 32 pending slots with canceled/expired entries, reject further jobs without leaking connections, cover an unexpected admission race, and verify safe replacement of broken facade symlinks. No AVD or Android application was built. The agent daemon and existing emulator services remained running.

A successful smoke run does not demonstrate that a real Android build fits the cap or that external launchers use the queue. Verify the lifecycle environment and each independent runner separately. See [runtime recovery](../../docs/runtime-recovery.md) for the companion plugin and installation procedure.

## Remove

Drain or explicitly cancel queue jobs first. Stop and disable only `pandaos-android-queue.service`, remove its installed files and slice, reload the system unit manager, and restore the configured account's Gradle properties from the first relevant backup. Remove the creation policy and session environment integration before opening new provider processes. Existing emulator services and the main daemon do not need to be stopped. Do not restore a later backup that merely contains this installer's own defaults.
