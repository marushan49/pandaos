# Session Recovery

Find interrupted sessions under **Unterbrochene Sessions** in the sidebar or Command Center. Select **Weiterarbeiten** to send a continuation prompt to that session. **Ausblenden** clears a recovery entry without changing its agent.

The plugin saves turn checkpoints in its isolated data directory. A different daemon invocation with an unfinished checkpoint identifies an interruption. Failed turns are also listed. Completed turns, canceled turns and archived sessions are excluded. Existing running turns are enrolled when a connected client loads the plugin. Crashes from before installation can only be identified when a session still has a stored error.

Resume is manual. A fresh snapshot prevents resuming an already running, archived or permission-blocked session. Each recovery entry uses a stable message ID for retries and concurrent clicks. A continuation uses steering to avoid interrupting work that starts between the snapshot and submission.

The plugin records metadata and errors, not prompts or transcripts. Writes are atomic, fsynced and private to the daemon user. Damaged state fails visibly instead of silently resetting the ledger. Reloading a plugin under the same daemon invocation does not mark running work as crashed.

This plugin helps recover work. Host resource limits and the Android queue prevent build processes from consuming the daemon's resources.

## Install

Requires PandaOS or Paseo 0.11.0 or newer with plugins enabled. Install this directory or the Git source pinned to the addon release:

```sh
paseo plugin install git:marushan49/pandaos:plugin-examples/session-recovery --ref runtime-recovery-v0.1.1
```

The plugin also discovers an installed Linux Android queue and injects its policy and guarded environment into future provider sessions. Without that queue it provides recovery only. Full installation, limits and removal instructions are in the repository's `docs/runtime-recovery.md`.
