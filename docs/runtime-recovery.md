# Runtime recovery

Install the optional Session Recovery plugin to find unfinished work after daemon or provider failures. On Linux, add the Android queue to serialize heavy tooling outside the agent daemon's cgroup. These components install without restarting the main daemon. The addon has its own release tag; it does not upgrade desktop or mobile applications.

## Install the plugin

Use PandaOS or Paseo 0.11.0 or newer and enable plugins in host settings. `pandaos` and `paseo` expose the same plugin commands; use the binary installed on your host.

```sh
paseo plugin install git:marushan49/pandaos:plugin-examples/session-recovery --ref runtime-recovery-v0.2.0
paseo plugin ls
```

For a source checkout or extracted release archive:

```sh
paseo plugin install /absolute/path/to/plugin-examples/session-recovery
```

The Git source requires access to its repository. A downloaded release archive supports directory installation without Git acquisition. The daemon compiles the plugin entries when loading them; installing the plugin requires no npm preparation or application build. See [plugin sources](plugins.md#install-a-git-source) for remote hosts and source updates.

## Recovery and history

Open **Unterbrochene Sessions** in the sidebar or Command Center. The page shows open cases, the **Automatisch fortsetzen** switch and a persistent history. Select **Weiterarbeiten** for one interrupted session, **Session öffnen** to inspect its chat, or **Ausblenden** to remove its recovery entry.

Automatic recovery is off on a fresh installation. Enable it to continue newly failed turns and unfinished checkpoints from a previous daemon invocation. It permits three automatic attempts per consecutive failure chain, with delays of 2.5, 5 and 10 seconds. One automatic continuation runs at a time. A completed or canceled turn resets the budget; explicit manual continuation starts a new budget. Previously imported errors stay manual. Authentication, quota, rate-limit and context-limit failures stay manual too.

A fresh snapshot and checkpoint check prevent continuing active, archived, stopped or permission-blocked work. Closing a session leaves its recovery entry manual. Turning automation off prevents submissions that have not yet started; it does not cancel an already accepted turn. Ambiguous submission errors pause that entry for manual review. Retries retain their message ID and check the chat before sending again.

The original chat shows a labeled continuation request and a compact recovery row with its time, reason and result. **Verlauf** keeps the latest 200 attempts across reloads and daemon restarts. “Fortgesetzt” means the continuation was accepted, not that the original task completed.

Turn start, accepted-message and completion hooks track future work. For a restart you control, use the [planned daemon restart](#planned-daemon-restart). Client plugin activation bootstraps recovery when a host connects; opening a provider session and lifecycle events also trigger reconciliation. After a daemon restart, automatic recovery needs one of those triggers. A headless host with no connected client or session activity does not immediately start recovery. The first reconciliation enrolls existing active sessions and stored provider errors. A crash that predates installation cannot be reconstructed from an ordinary idle session. The optional accepted-message hook covers requests that crash before their turn starts on hosts supporting that hook.

The ledger lives in the plugin's host-owned data directory. Checkpoints contain metadata and error summaries, not prompts or transcripts. A planned restart also stores each session's status reply, capped at 4,000 characters, until it is handed back. Writes are atomic and fsynced. Damaged storage produces an error instead of an empty list. Plugin reload within the same daemon invocation does not count as a crash. Keep the data directory when changing the installed source.

## Planned daemon restart

Restart the daemon through `plugin-examples/session-recovery/bin/planned-restart.mjs` (installed on the Zotac as `pandaos-planned-restart`) instead of `systemctl restart` or waiting for idle. Agents get the `pandaos-daemon-restart` skill for this.

The script runs as its own systemd unit, because the restart ends the invoking agent. It calls `session-recovery.restart.prepare`: every running session and every session active in the last 15 minutes receives a steered request to finish its step and answer with `STATUS: working | watching | done` and a checkpoint. Requests run concurrently and wait at most `--timeout-sec` (180). An answered session is stored with its checkpoint and leaves automatic recovery, so it is continued once. Sessions that wait for a permission or do not answer stay on the ordinary interrupted path.

Then the script restarts the service, optionally switching `~/projects/pandaos-live` to `--release` first. It accepts the restart when the service is active, reports the same server ID and serves the release's web bundle; otherwise it switches back. Afterwards `session-recovery.restart.resume` sends each `working` or `watching` session its checkpoint. `--dry-run` lists the sessions that would be asked and sends nothing. Logs go to `~/.pandaos/planned-restart/`.

The heads-up starts a provider turn in every selected idle session. Background work a provider keeps outside a turn is only as visible as the session's own checkpoint.

## Add the Linux build scheduler

The host build scheduler replaces the single-slot Android queue and keeps its entry points. Read [the scheduler README](../scripts/build-scheduler/README.md) for architecture, limits and rollback. Install the legacy queue first for its JDK/SDK facades and `agent-env.json`, then install the scheduler and route the legacy entry points to it:

```sh
sudo -n python3 scripts/android-queue/install.py \
  --user "$USER" \
  --java-home /path/to/installed/jdk \
  --android-home /path/to/installed/android-sdk
sudo -n python3 scripts/build-scheduler/install.py --switch
pandaos-build-scheduler status
```

Session Recovery reads the root-owned `/etc/pandaos-android-queue/agent-env.json` before creating agents and opening provider sessions. It preserves incoming environment values except for the guarded JDK/SDK variables and prepends guarded tool directories to PATH. New agents receive the scheduler policy; newly opened and resumed provider sessions receive the environment across providers. Existing processes keep their environment until reopened. An invalid or writable queue configuration rejects agent creation/session opening with a visible error; repair that root-owned file instead of bypassing the resource policy.

Submit the entire command so Node, prebuild and native compilers share one job:

```sh
pandaos-android-queue -- npm run android:production
pandaos-build-scheduler --priority blocking -- cargo test -p michelin
```

The Java and SDK emulator facades catch common unwrapped entry points. Absolute real tool paths, independent containers or services, SSH workers and external CI runners require their own complete-command integration. The scheduler is cooperative tooling policy, not a security boundary.

Host SSH capacity and daemon scheduling remain separate administration. CPU weights and memory-low settings are soft protections; these addons cannot guarantee connectivity through host or network failure, and unrelated processes can still cause host pressure.

## Remote build workers

The Linux queue does not schedule macOS builds. Before delegating to a Mac, verify SSH access, available memory, JDK, Android SDK, Node and Xcode for the requested target. A worker needs a fixed source revision, its own admission and resource policy, bounded cancellation and checked artifact transfer. Merely detecting a reachable Mac does not establish those controls. Do not silently run a remote build or claim distributed scheduling is installed.

## Verify and remove

Run the scheduler's smoke check and the plugin's existing focused test file from a development checkout. Those checks use short processes and turn fixtures; they do not prove a real Android application fits the cap. Verify the UI by enabling automatic recovery, interrupting only a disposable provider session, and checking that one continuation, its chat marker and its history entry appear without manual input. Check explicit stop and exhausted retry cases in the focused suite.

```sh
python3 scripts/build-scheduler/smoke.py
npm run test --prefix plugin-examples/session-recovery
```

Disable `session-recovery` through plugin management to stop its hooks while keeping its data. Removing the plugin deletes its settings and data: back up the host-owned data directory before removal if you need the recovery evidence. To return to the single-slot queue, run `install.py --rollback` from `scripts/build-scheduler/`. To remove the queue entirely, first remove the plugin's environment integration, drain or explicitly cancel jobs, and follow [queue removal](../scripts/android-queue/README.md#remove). Restore the configured account's Gradle properties from the first relevant backup. Do not stop the agent daemon or unrelated emulator services.
