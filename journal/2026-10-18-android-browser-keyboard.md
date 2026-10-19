# Android browser keyboard duplication

## Done criteria

A keystroke is forwarded once; repeated letters remain valid. Native replacement keeps input focus and selection; reset wins over a queued replacement. Focused regression, App typecheck/lint, native bundle/APK and a real-device flow distinguish verified source behavior from installed behavior.

## Cause and change

The hidden remote-browser input forwards its full text and calls `replaceText("")` inside `onChangeText`. React Native 0.81.5 invokes that callback before updating its native-event counter. Its `clear()` closure still carries the previous counter; Android ignores stale commands. The old buffer remains and gets included in the next forwarded text change.

The native EditingTextInput primitive updates its public text ref immediately, queues the native replacement, and applies it in a layout effect after the child input commits its event counter. Reset discards a pending replacement. The web primitive and wire protocol are unchanged. Owning gotcha: docs/forms.md.

## Evidence

- 12 focused existing-suite tests pass. Regression sends repeated `a`, `a`, `b` through the input and models native rejection of a clear during change handling. The identical regression against the original source fails with retained `a`. Logs: `.dev/android-browser-keyboard/check-build.log`, `regression-before.log`.
- App typecheck passes; targeted lint and formatting pass. Early test callback lint failures were fixed before the passing run. Initial worktree export failed because compiled workspace outputs were missing; nested dependency node_modules were restored and the owning plugin dependency build then passed in Queue1399. This was environment setup, not a keyboard runtime failure.
- Read-only Sonnet Advisor60640997 confirms RN ref attachment precedes the parent layout effect and finds no blockers for reset/selection/paste/terminal callers. This is a source review, not a device run.
- Queue1398 initially reported success but produced an APK byte-identical to the prior installed artifact. It was rejected before installation. The task configuration ran before the plugin's own configuration, leaving bundle inputs unchanged. The corrected projectsEvaluated override asserts the worktree bundle root and forces only the bundle task. Queue1400 failed because nested app dependencies were unavailable through a directory symlink. Queue1402 advanced further and exposed the final missing local audio build. After materializing the nested dependencies and building that owning package, Queue1404 succeeded in2m6s. No failed artifact was installed. No persistent daemons or raised host limits; Gradle/native output stays in the existing main build directory.

## Artifact provenance and scope

Candidate includes the installed download fix from two main-checkout overlay files so updating the phone preserves its previous fix. The candidate script records their SHA256 in `candidate-overlays.json` and restores the worktree originals on exit. These overlays are excluded from the keyboard source change. Other main-checkout edits remain untouched.

No commit, push, merge, daemon restart, phone installation or phone UI interaction has been performed. Phone ADB connection established via Queue1392; initial device listing was empty. Build and package verification are finished. Native installation and keyboard validation require user approval; the phone currently reports its lock screen. Sessions and workspace remain visible.

## Limits

Fast native input arriving before a JS commit can still invalidate any native text command; advisor identifies this as an existing transport limitation. The source fix removes the deterministic stale-counter call. A real-device typing run is needed before claiming the reported phone behavior is fixed.

## Ready for device approval

- Queue1404 APK build passed; Queue1406 package verification passed. APKsh.pandaos0.11.2/code11002, arm64,151493934bytes, SHA256`498e125607fe28ba9ae12c6cc802c5ae01e36d0c8aece151777f225746eaa91d`.
- Packaged Hermes bytes equal the freshly generated bundle and differ from the previously installed APK. The Metro source map contains the exact native source bytes matching SHA256`b7bd8263c0ba55969926e713b9980055b7798c9622895e9fc454737cc5b1cd65`. Same certificate digest as the previously verified installed APK; package ID unchanged. Receipt `.dev/android-browser-keyboard/apk-verification.json`.
- Existing diagnostic Hermes-O0 profile retained. Candidate download overlays restored afterward; final source change contains only native primitive, its existing test suite and owning documentation, plus this journal. Main source checkout unchanged.
- Phone package still reports last update16.10.202620:43:48; no installation or native typing test was executed. Ready-to-install file `.dev/android-browser-keyboard/PandaOS-keyboard-fix.apk`. Await user permission for update plus harmless keyboard fixture test; phone unlock required.
