# Android composer and speech input

## Requested outcome

Image attachments have their own bounded area above the input. Adding images keeps the input and microphone/send controls reachable with the Android keyboard open. Speech input requests microphone permission before starting native capture and shows the result or an actionable error.

## Evidence and decisions

- Verified before the change: composer/input/input.tsx rendered attachments inside its input surface; composer/index.tsx wrapped attachment rows without a height bound. Controls used28-unit buttons on native.
- Verified on connected Android device 100.96.225.48:5555: PandaOS 0.11.0 installed and running, RECORD_AUDIO currently not granted. No dictation-specific error found in the filtered current app log.
- Inferred: wrapping previews and shrinking input can displace controls. Native dictation also initializes its audio engine before startCapture, although startCapture already requests permission and initializes in the right order; remove the redundant earlier initialization.
- Preserve the current theme and attachment open/remove actions. Use a horizontal attachment strip outside the input shell, bounded to one row. Keep the compositor's total height measurement and voice overlay ownership. Use native 44-unit action targets.
- No OS permission granted automatically. Backend disabled-state diagnosis replaced the initial symptom clarification.

## Affected files

composer/input/input.tsx, composer/index.tsx, hooks/use-dictation-audio-source.native.ts. Existing native audio engine and speech capability checks remain the sources of truth.

## Acceptance

Build and typecheck/lint. Real built browser flow at phone width with several images and keyboard-safe controls, saved screenshot/recipe. Android APK built through pandaos-android-queue, no permanent Gradle/Kotlin daemons. Native installation/recording outcome only after actual device verification; no claim from a web test. Main daemon restart remains unapproved from the separate tab-lifecycle task.

## Speech cause confirmed

The connected production daemon reports capabilities.voice.dictation.enabled=false and capabilities.voice.voice.enabled=false, with explicit disabled-config reasons. Persisted features.dictation and features.voiceMode are both disabled. No OpenAI speech credentials are configured in the daemon runtime. The button should explain this condition on tap instead of becoming an unexplained disabled control. Enabling speech requires deliberate provider setup and the pending main-daemon restart authorization; do not claim that layout or permission order alone restores transcription. The symptom clarification was dismissed after this independent diagnosis.

## Isolated build checkpoint

PandaOS-managed worktree /home/admin/.pandaos/worktrees/1deov5kv/pandaos (wks_73a2a9620b551cfe) contains only the three changed app files. Attachments are a single horizontal row above the input shell, native controls use 44-unit touch targets, disabled speech reports its reason on tap, native dictation calls startCapture directly so permission is requested before initialization. Typecheck/lint are being validated before the single isolated web/APK build. No permission changes on the phone or main-daemon restart.

## Build and validation

Final app Typecheck and targeted Lint passed in Queue #171. Queue #172 (083c01f61d224c5ba815e93d7c345d74) runs the isolated native build, guarded Java/Android environment preserved, 2 GiB JVM heap and one Gradle worker, in-process Kotlin, no persistent daemons. Web export and Expo Android prebuild finished; native C++/Android compilation running. Full build output is .dev/android-composer-build.log.

## Waiting for native build and speech choice

Automatic continuation is registered via heartbeatf10a28e5 (bounded90minutes, max18; supersedes48e4a6d6); previous heartbeats91647c78,01edb45b,e423dbc3 were deleted. Queue179 /69d61262a6124b09a46c3fc13f01196f finished with timeout exit124 after20minutes; no APK produced. Compiler help-only181 passed exit0, locally verified -O0 supported. Diagnostic build182 finished exit0 in4m4s, signed/ZIP verification passed. Signer/device check184 finished exit0, sameSigner=true, package sh.pandaos version0.11.0/code11000 arm64-v8a. No own jobs remain. Preparation complete; explicit main-restart/Android-install approval is the sole next blocker. Corrected speech proof Queue178 /10000eb91db849f896376e42f0f12404 finished successfully, exit0. Do not duplicate these jobs or repeat the passing speech proof. UI proof completed; device activation still awaits reviewable APK and actual-device verification.

Read-only advisor ca125aea-d6a6-43dd-94a2-7d8fb74b3fca completed, no blocking source defect. Keep the bounded attachment strip across platforms and verify access to later images via scrolling. The browser check must not be described as Android keyboard/gesture evidence: native keyboard with long text, image strip vs sidebar swipe ownership, and enlarged controls remain actual-device checks. Existing double error toast on permission failures was noted; initialization failures now use that existing error path. This does not block the requested layout fix. Advisor session remains open.

The user explicitly approved German recognition on the Zotac: “Ja, auf dem Zotac einrichten.” Prepare the optional Parakeet v3 model and verify German transcription independently before production activation. Default v2 remains English. No speech feature or microphone permission changed. The new APK is not installed on the phone yet. Main-daemon restart still requires the separate explicit approval.

## Build recovery and UI evidence

Queue172 canceled through the supported queue command, exit130, after confirmed memory pressure: 18 C++ compiler processes, memory near6GiB high limit, full memory pressure approximately24%, no OOM. Limits were preserved. Queue174 /aad57bfca77a4ac6b4624f4ea1665abd (exec39825) resumes only native Gradle assembly with explicit CMake compile/link job pools (2/1), one Gradle worker, existing2GiB heap, no persistent daemons. Script .dev/android-composer-native-resume.sh, log .dev/android-composer-native-resume.log; do not duplicate. Queue173 completed the UI proof and its own temporary process was stopped afterward.

Built web UI tested through browser_test first. Old test-origin saved host identity and nonunique generated CSS selectors blocked scripted clicks; took over on the same test tab and completed using exact accessible-label DOM actions and production paste handling. Six valid PNG fixtures produced one66px row above the input at390x700, mic stayed at y642 before/after, send remained enabled and within bounds. At320x500, row stayed66px and both controls remained inside the viewport. Horizontal scroll API exposed the last image at offset68, last-image removal reduced count to5, re-add returned6, preview opened and closed. Tool scrolling on a child did not move the strip; actual wheel/swipe behavior is not confirmed. Disabled mic tap showed the real backend explanation.

Final browser_test visibility/screenshot checks passed, evidence evidence://wks_3bf2bc3792837760/evr_0e8e5fae-fbdb-4b12-babd-f63ffb791a6d, screenshot /screenshot-six-attachments-stable-composer. Saved recipe android-composer-attachments-visible checks a prepared composer with fixture attachments; it does not upload them or prove native gestures. Own completed verification tab1791821608968-a1013dc771b104b1 closed after evidence saved. Native keyboard/44-unit controls and recording still require actual Android verification.

## German model preparation

Official NVIDIA model card https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3 confirms German and CC-BY-4.0. Read through agent-reach routing with the required Paseo browser; the useful model-card tab1791822268236-b0c0626f0a659fd0 remains open. Official Sherpa release archive487170055bytes downloaded and staged at /home/admin/.pandaos/models/local-speech/.downloads/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2. Queue175 /79d06c4b034c4b4c888b5239c7e19012 runs existing atomic model installer and an isolated daemon dictation stream using a local synthetic German fixture. Script .dev/android-german-dictation-setup.sh, log .dev/android-german-dictation-setup.log, success artifact .dev/android-german-dictation-proof.json. Configuration patch .dev/android-dictation-config.patch.json is prepared; production config remains untouched. Model/backend proof will not prove Android microphone capture or the user's own speech quality.

## Activation preparation

Active release71d8e733a already contains Parakeet-v3 support in compiled model-catalog.js. Main-daemon PID4132128 and speech overrides are unchanged; no PASEO*DICTATION*\* or PASEO_LOCAL_MODELS_DIR environment overrides are present. German dictation can therefore use the current release after the reviewed config patch and explicitly approved restart, without deploying unrelated root server changes.

Read-only candidate/device signer and manifest check was Queue176 /357825f9dae8484190cff20fce3d8faa; canceled before execution after native recovery became necessary. Requeue only after successful APK creation. Script .dev/android-composer-signature-check.sh; output .dev/android-composer-signature-check.log and .json. It checks candidate exists before reading the device APK, never installs/uninstalls or changes phone permissions. Check signer match before proposing a data-preserving app update; no automatic uninstall on mismatch.

## Second resource bottleneck and bounded recovery

Queue174 finished C++ and Metro bundling, then Hermes plus Gradle exceeded the6GiB high watermark. Confirmed full memory pressure83%, Gradle RSS2.79GB with2GiB heap, Hermes RSS3.17GB, compiler stuck in D-state; no OOM/limit increase. Canceled only own174 and pending176. Native compilation remains cached. One bounded retry Queue177 /91f066e05ddd41ffb17f44ff49a7e31b (exec42554) uses .dev/android-composer-native-final.sh/.log, CMake pools2/1 preserved, Gradle heap reduced to1GiB/metaspace384MiB. Previous log retained .dev/android-composer-native-174.log.

Queue175 failed immediately because the proof script imported server/audio.js instead of speech/audio.js. Corrected the path after source lookup; no model installed and production remained untouched on that failure. Corrected German setup/proof queued as Queue178 /10000eb91db849f896376e42f0f12404 (exec89174), same existing archive and scripts. This proof also validates the patch against the installed release schema/resolver and writes .dev/android-dictation-config-review.json before installing the model. Wait for177/178 without duplicate jobs. On another native failure report the exact job/error and preserve the host limits rather than looping unchanged retries.

## Reviewed compiler recovery

177 also reached67% full memory pressure while Hermes optimized the53MB bundle. The existing advisor reviewed the local React Native plugin source and recommended one bounded smaller change: retain Hermes runtime and -O, omit -output-source-map. Memory benefit remains inferred, not verified. This is not the standard release profile: compiler/composed source maps and readable release stack traces are unavailable. Do not describe the artifact as identical to a normal release.

Canceled177 after roughly15minutes, native cached tasks retained. Queue178 now runs first, validated the proposed config through active release71d8e733a schema/resolver (.dev/android-dictation-config-review.json, installedRuntimeValidated=true, productionModified=false), then began atomic model extraction. Queue179 /69d61262a6124b09a46c3fc13f01196f exec43838 is already queued once, hard1200second runtime, script .dev/android-composer-native-no-map.sh, init .dev/android-hermes-no-map.gradle, log .dev/android-composer-native-no-map.log. Profile metadata .dev/android-composer-build-profile.json records the nonstandard map setting. No optimisation downgrade or host-limit change made. If179 fails, report that exact failure; an unoptimised -O0 diagnostic APK is only a possible distinct strategy after verifying flag support and clearly labelling its runtime-performance difference, not an unchanged retry.

## German recognition verified

Queue178 passed, exit0. Parakeet-v3-int8 is atomically installed in the configured production model directory. The isolated real daemon dictation protocol recognized the locally synthesized German10-second fixture, with all five target words (deutsch, Spracherkennung, Android, Handy, Bilder); the proper name was imperfect (“Marus Hahn”). Available dictation capability enabled=true with empty reason, realtime voice stays disabled. Evidence .dev/android-german-dictation-proof.json. This proves local backend/model/protocol with synthetic speech, not Android capture or the user's own speech. The reviewed patch passes active-release schema/resolver; production config and main PID4132128 remain unchanged pending explicit restart approval.

Actual179 compiler arguments observed: -O present, -output-source-map absent; profile metadata updated to observed status. Early compiler phase still near6GiB with memory pressure, so memory benefit is not confirmed. Let the bounded1200second job resolve; no changed host limits or implicit release-quality claim. Advisor's suggested -O0 flag support was not verified because its binary-read attempt was rejected; any later diagnostic variant needs an actual queued compiler-help verification and explicit artifact labelling first.

## Optimized build timeout

179 ended at19:24:51CEST with exit124 after its fixed20-minute runtime, still in Hermes -O compilation, no candidate APK. Removing compiler maps did not resolve the observed6GiB memory pressure. No limits were raised. Prepared a clearly labelled diagnostic-only -O0 script/init, not executed; local queued compiler-help support must pass first. One bounded distinct diagnostic attempt is the last local build strategy; no unchanged retries. Signer-check script now accepts an explicit candidate path, preserving the normal default. No Android install, config mutation or main restart.

## Current waiting checkpoint 19:27CEST

Compiler-help181 /d835acd6ad404274bb306045e6b1e6ae exec46978 remains queued behind unrelated job180; do not stop that job or enqueue duplicates. Own future diagnostic script .dev/android-composer-native-diagnostic.sh is prepared but not started. If help verifies O0 support, submit it exactly once with queue --timeout1200; record its ID/session before yielding. On success signer script takes explicit diagnostic APK path. Current automatic continuation f10a28e5 registered through20:57CEST/max18; old48e4a6d6 deleted. Delete after resolved preparation or true approval blocker. Speech178 passed and production still unchanged.

## Diagnostic build running19:30CEST

Compiler-help181 passed exit0: local hermesc --help verifies -O0 means no optimizations. Submitted exactly one diagnostic build182 /22e3a2ba2ffd457f99e2b28a4b1558b0 exec36467 via queue --timeout1200, immediately running. Script .dev/android-composer-native-diagnostic.sh, log .dev/android-composer-native-diagnostic.log; profile .dev/android-composer-diagnostic-profile.json; success target .dev/PandaOS-android-composer-mic-diagnostic.apk. Keep as diagnostic-only, no runtime-performance claim or standardrelease claim. On success signer-check once with explicit diagnostic path. On failure record actual error/job and do not retry again. Hostlimits preserved. MainDaemon/config/phone unchanged. Heartbeatf10a28e5 active, read this current checkpoint rather than its stale181 prompt.

## Diagnostic APK built

182 passed exit0, Gradle BUILD SUCCESSFUL in4m4s, ZIP integrity and apksigner verification passed. Candidate .dev/PandaOS-android-composer-mic-diagnostic.apk, SHA25679f81277807371d892b42c3c29b145089f52469eaa771768e0d437494d291b2e. Profile .dev/android-composer-diagnostic-profile.json records diagnosticOnly=true, -O0, no compiler maps, performance unverified, artifactBuilt=true. Submitted read-only candidate/device signer/manifest check once: Queue184 /49cbe50eeb264daba9d2e354a379af11 exec12160, runtime120seconds. Wait existing result, do not duplicate. No app install/config mutation/main restart yet.

Installed release daemon-config-store RELOADABLE_PATHS checked directly: features.dictation is absent, so hot config reload cannot activate the speech patch. Main-daemon restart needs explicit approval under CLAUDE.md:121. Candidate signer check184 is queued behind unrelated183; do not interfere with it. Production speech config remains unchanged.

## Ready for explicit activation/install approval

184 passed exit0. Candidate and installed Android app certificate SHA256 both fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c, package sh.pandaos, version0.11.0/code11000, min29/target36. Candidate is .dev/PandaOS-android-composer-mic-diagnostic.apk (150975610bytes), diagnostic-only -O0/no compiler maps; runtime performance is unverified. Signed APK integrity verified, no app install or phone permission change.

German model/backend/protocol and installed-release config patch validation passed. Production config still disabled, mainDaemon PID4132128 untouched. Exact proposed activation: preserve concurrent config values, back up and validate features.dictation patch (local Parakeet-v3-int8, de), then explicitly approved mainDaemon6767 restart using current release71d8e733a. Proposed phone action: approved data-preserving adb install -r of sameSigner diagnostic candidate, never uninstall. Native keyboard/swipe/microphone capture remain unverified until actual-device flow. Separate earlier tab-source rollout remains outside this speech-only restart.

Automatic continuationf10a28e5 deleted after all own jobs resolved, because explicit approval is now required by CLAUDE.md:121 and phone modification rule. Ask one concrete bundled activation/install permission; no more build retries. Keep all AgentSessions and usefulNVIDIABrowser open. Preparation is complete, original task awaits activation and device verification.
