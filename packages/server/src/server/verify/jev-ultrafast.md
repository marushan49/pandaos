# Jev Ultrafast source

`ultrafast-snapshot.ts` embeds `jev_ultrafast/snapshot.js` from [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast/tree/1231850a0bf1a0c0341fe408ef1668dbbfdfac46), commit `1231850a0bf1a0c0341fe408ef1668dbbfdfac46` (2026-10-20). Its MIT license is in `jev-ultrafast.LICENSE`.

PandaOS adapts the reader to the existing native host and ref-based executor. Password fields remain actionable for local credential slots; their values are omitted from model state. Only internal Jev snapshots request this reader through the optional `forGoal` snapshot argument; ordinary snapshots keep their prior collector. The adapter emits current values, selected/checked/expanded states, editable/clickable capabilities, and available native dropdown choices. Page and target guards remain host-local. The existing host executes input after validating DOM identity, page/form state and hit testing. Coding agents supply public text slots instead of a separate text-model credential.

The operation/compatible-target policy and action rules in `browser-tools/jev-goal-runner.ts` follow upstream `model.py` and `questions.py`; only the target head belonging to the chosen operation can execute. No Python process, upstream demo server, browser profile or cloud browser is launched.
