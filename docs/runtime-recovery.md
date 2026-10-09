# Runtime recovery

Install the optional Session Recovery plugin to find unfinished work after daemon or provider failures. On Linux, add the Android queue to serialize heavy tooling outside the agent daemon's cgroup. These components install without restarting the main daemon. The addon has its own release tag; it does not upgrade desktop or mobile applications.

## Install the plugin

Use PandaOS or Paseo 0.11.0 or newer and enable plugins in host settings. `pandaos` and `paseo` expose the same plugin commands; use the binary installed on your host.

```sh
paseo plugin install git:marushan49/pandaos:plugin-examples/session-recovery --ref runtime-recovery-v0.1.1
paseo plugin ls
```

For a source checkout or extracted release archive:

```sh
paseo plugin install /absolute/path/to/plugin-examples/session-recovery
```

The Git source requires access to its repository. A downloaded release archive supports directory installation without Git acquisition. The daemon compiles the plugin entries when loading them; installing the plugin requires no npm preparation or application build. See [plugin sources](plugins.md#install-a-git-source) for remote hosts and source updates.

Open **Unterbrochene Sessions** in the sidebar or Command Center. Select **Weiterarbeiten** for one interrupted session, **Session öffnen** to inspect its history, or **Ausblenden** to remove its recovery entry. No session resumes automatically. A fresh snapshot prevents continuing an already active, archived or permission-blocked session.

The ledger lives in the plugin's host-owned data directory. Keep that directory when changing the installed source. Checkpoints contain session metadata and an error summary, not prompts or transcripts. Damaged storage produces an error instead of an empty list. Plugin reload within the same daemon invocation does not count as a crash.

Turn start, accepted-message and completion hooks track future work. The first connected client also enrolls existing active sessions and stored provider errors. A crash that predates installation cannot be reconstructed from an ordinary idle session. Completed, canceled and archived runs are excluded. The optional accepted-message hook covers a request that crashes before its turn starts on hosts supporting that hook.

## Add the Linux Android queue

Read [the queue installation and limits](../scripts/android-queue/README.md) first. Download the addon archive or use this checkout, then install using the real JDK and SDK paths:

```sh
sudo -n python3 scripts/android-queue/install.py \
  --user "$USER" \
  --java-home /path/to/installed/jdk \
  --android-home /path/to/installed/android-sdk
pandaos-android-queue status
```

The queue requires Python 3.10+, systemd 249+ and unified cgroup v2. It runs one FIFO job as the configured account under a root-owned system slice, with a shared 8 GiB hard memory cap, no swap, two CPU cores and 512 tasks. It does not move existing builds or emulators.

Session Recovery reads the root-owned `/etc/pandaos-android-queue/agent-env.json` before creating agents and opening provider sessions. It preserves incoming environment values except for the guarded JDK/SDK variables and prepends guarded tool directories to PATH. New agents receive the complete-command queue policy; newly opened and resumed provider sessions receive the environment across providers. Existing processes need their explicit command wrapped until reopened. An invalid or writable queue configuration rejects agent creation/session opening with a visible error; repair that root-owned file instead of silently bypassing the resource policy.

Submit the entire Android command so Node, prebuild and native compilers share the cap:

```sh
pandaos-android-queue -- npm run android:production
pandaos-android-queue -- ./gradlew assembleRelease
```

The Java and SDK emulator facades catch common unwrapped entry points. Absolute real tool paths, independent containers or services, SSH workers and external CI runners require their own complete-command integration. The queue is cooperative tooling policy, not a security boundary. A build exceeding its memory cap fails; it does not receive an automatic larger budget. Existing foreground emulators occupy a slot if queued separately, so reuse an existing emulator or include tooling inside one bounded job.

Host SSH capacity and daemon scheduling remain separate administration. CPU weights and memory-low settings are soft protections; these addons cannot guarantee connectivity through host or network failure, and unrelated processes can still cause host pressure.

## Remote build workers

The Linux queue does not schedule macOS builds. Before delegating to a Mac, verify SSH access, available memory, JDK, Android SDK, Node and Xcode for the requested target. A worker needs a fixed source revision, its own admission and resource policy, bounded cancellation and checked artifact transfer. Merely detecting a reachable Mac does not establish those controls. Do not silently run a remote build or claim distributed scheduling is installed.

## Verify and remove

Run the queue's focused smoke check on an idle queue and the plugin's existing focused test file from a development checkout. Those checks use short processes and turn fixtures; they do not prove a real Android application fits the cap. Verify the UI by interrupting only a disposable provider session, selecting **Weiterarbeiten**, and checking that its continuation appears once.

```sh
python3 scripts/android-queue/smoke.py
npm run test --prefix plugin-examples/session-recovery
```

Disable or remove `session-recovery` through plugin management to stop its hooks. Preserve its data for reinstall if recovery evidence is needed. To remove the queue, first remove the plugin's environment integration, drain or explicitly cancel queue jobs, and follow [queue removal](../scripts/android-queue/README.md#remove). Restore the configured account's Gradle properties from the first relevant backup. Do not stop the agent daemon or unrelated emulator services.
