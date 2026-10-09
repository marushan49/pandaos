# Session Recovery

Find interrupted sessions under **Unterbrochene Sessions** in the sidebar or Command Center. Enable **Automatisch fortsetzen** to continue interrupted work with a finite retry budget. The page shows open cases and persistent history; the original chat shows a recovery row with its time and reason.

Automatic recovery is opt-in. Explicit stops, archived sessions, permission requests and historical imported errors are excluded. You can also select **Weiterarbeiten** manually or **Ausblenden** to clear an entry without changing its agent.

Requires PandaOS or Paseo 0.11.0 or newer with plugins enabled:

```sh
paseo plugin install git:marushan49/pandaos:plugin-examples/session-recovery --ref runtime-recovery-v0.2.0
```

The plugin discovers an installed Linux Android queue and injects its policy and guarded environment into future provider sessions. Without that queue it provides recovery only. Read [runtime recovery](../../docs/runtime-recovery.md) for retry rules, startup triggers, installation, limits and data-preserving disablement.
