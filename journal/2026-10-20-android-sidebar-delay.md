# Android sidebar delay and direct rollout

The user tested the first installed APK and reported that the sidebar remained delayed. The spinner also returned when immediately revisiting the same chat. The first child-mount deferral did not satisfy the device check and has been removed.

The follow-up keeps the current and previous native workspace mounted, bounded at two trees, without suspending Fabric descendants. Host startup prepares cached history locally for the attention or focused chat in five recent workspaces, falling back to their latest root chat. Opened chats already retain live timeline subscriptions when switching workspaces. This does not resume unopened provider sessions or keep Android running after the operating system suspends the process.

Follow-up source checks passed: bounded LRU return/eviction, cached paint before opening, focused-chat selection over a newer child, no client connection, app typecheck and targeted lint. The compact candidate Web flow A → B → A and reopening the sidebar passed after taking over a duplicate-selector failure in browser automation. Evidence: evr_013265cc-8ca7-4823-8283-556101bccd71, with zero console errors and failed requests. The final Browser test asserts the returned state; the switching clicks were performed through takeover and are recorded in the checkpoint. This is Web evidence only. Native first-open latency remains unmeasured.

## Native button follow-up

The user confirmed that the spinner was gone but the button remained delayed. The same sidebar opened immediately through its swipe gesture. This counterexample isolates the button's JS-dependent input path from the working native motion path; no native latency numbers were measured.

The compact native header now requests opening through a UI-thread tap. React adopts the animation later through the existing revision-checked commit, matching swipe ownership. The request may interrupt closing; repeated callbacks request the same target instead of toggling twice. A stable native host owns the recognizer, which explicitly waits for the enclosing open-pan to fail. Web and wide layouts retain their toggle behavior. Existing JavaScript work and sidebar row actions are not made independent of JS by this change.

Validation1680 passed15 panel model tests, app typecheck and targeted lint. The compact Web open/close/reopen regression passed in evr_41e103ce-0ecb-419a-8a1d-c6452de0b73e with zero console errors and failed requests. Packaging1683 and in-place update1684 passed. The installed APK hash is `236f04b494d7a9b5449218115b07afebd12d36605abcdd8d3efcae02db8af3b6`; its HBC hash is `f0a1dc0551d962219b58538c2af8b7f7bb0b8b9c7a8bfc84824540234fd590e0`. All ten recorded source-map hashes match the snapshot and current source. Signature and first install time are preserved. PandaOS was not foreground before installation and was not launched automatically; no running-process or native visual claim is made. The user confirmed the fast native tap on the installed update: “Ja, öffnet sofort.” The original sidebar delay is resolved according to the real-device manual test; numeric latency was not measured. Sonnet5.5 independently verified the final APK, HBC, ten sources and in-place installation. All build jobs finished and the heartbeat was removed. Evidence is in `.dev/android-sidebar-delay/native-tap/delivery-result.json` and the adjacent proof files.

## Follow-up Android delivery

Packaging1654 and in-place installation1655 passed. APK SHA256: `81a2e766a86c704c3bd2056f0b424df07e089c64c5c3a95a432bc37dc16b4e40`; HBC SHA256: `2d1aca01fa389b7bc02a954f06f9c7190c786f364485f97752fb119f50b6050c`. The installed APK matches exactly, seven relevant source-map files match the captured final source, the signing certificate and first install time are unchanged. Startup1657 found React Native main running with no fatal/Fabric errors in its captured log. The phone was awake and another app was in the foreground; its unrelated screenshot was discarded and is not UI evidence.

Evidence lives in `.dev/android-sidebar-delay/followup/`: `delivery-result.json`, `android-proof.json`, `android-installed-proof.json`, `android-startup-proof.json`, `browser-return-report.json` and `browser-return-verified.png`. The native A → B → A/sidebar test is pending with the user. No additional desktop or Zotac rollout was made. Sonnet5.5 independently checked artifact, source, signature and installed-update consistency; its remaining delivery flags concern the missing native acceptance and the distinction between takeover and scripted Browser evidence.

## Initial direct rollout

The user authorized the complete current local PandaOS build and direct rollout without CI, including required restarts and installations. The frozen source is main1f3aa4d8 plus captured local changes; source-manifest.json records every included file. Mac, Linux desktop, Zotac daemon/web and Android are updated. Generative UI was built but remains disabled as explicitly requested; existing Mail Breeze remains connected.

- Core build1622 passed server, desktop main, app/server typechecks, targeted lint and both web exports. The earlier sidebar source checks1596 also passed. No broad suite or CI was run.
- Both desktop archives verify1948 replacements, preserve native platform dependencies and match the captured source manifest. Mac installation passed codesign deep/strict, ASAR/header hashes and all139 delivery-file hashes. Mac identity and9 agent records are preserved. Linux installed139 delivery files match their payload hashes.
- Planned Zotac restart2026-10-20T07-58-08-633Z activated the frozen source and resumed working sessions. Server identity and887 baseline agent files are preserved. Two Breeze archive flags changed through a Mac-client archive request during concurrent use; no archive operation was part of this rollout. The actual served Web bundle matches the built bytes.
- After resource-limited Zotac attempts were stopped, the user explicitly authorized a maximum6-minute Mac compiler step. Matching RN0.81.5/HBC96 Hermes compiled with -O -fno-inline; native packaging1641 passed. The APK, its installed copy and five relevant source-map files match their recorded hashes. Update1643 preserved the signature and firstInstallTime; check1645 confirmed running PID22807 and the exact installed APK hash.
- Production browser checks passed settings/About and twice closing/reopening the compact430x932 sidebar, with zero console errors and failed requests. Evidence runs: evr_fc822cf8-b78e-47e2-ba43-478e29edb546 and evr_a2ea4b54-c661-48b3-bc9b-206c0204889d. The phone was Dozing; its black screenshot is not visual or touch proof. Mac display capture was unavailable.

## Delivery Gate

Code scope and comment hygiene passed. The native tap reuses the existing gesture revision and acknowledgement contract; no new dependency, feature flag or persistence change was added. Existing product design, copy and assets are retained; design/copy gates are not applicable. Static checks, build provenance, installation and Web flow are verified. Native button responsiveness is confirmed by the user’s real-device test. The automated Agent Device regression was not run. The regression requires another substantial-history WORKSPACE_KEY and a paired debug app; agent-device/Maestro were unavailable and phone input injection was denied.

Claude Sonnet5.5 reviewed the trail and delivered artifacts read-only, with no critical findings. It confirmed the installed Android artifact and left native touch latency explicitly open. The user answered that the installed sidebar was still delayed. The final native-tap follow-up passed the user’s real-device acceptance check.

## Evidence and preservation

Canonical evidence: .dev/rollout-2026-10-20/checkpoint.md, decisions.tsv, delivery-result.json and platform proof files. APK SHA256:60e0c1dafc71fce0a2950b76501c440a1fa40d9e7f65b41c1ae471ea85c25dc2. Source workspace-screen.tsx SHA256:6be1e8b8c644a0cf2b69ad85452c6ad0029d18d30a6d7f40d529d4b0cba2c9c8.

The live Zotac link currently targets .dev/rollout-2026-10-20/source. Preserve that directory and its built dependencies until a later planned release switch; LIVE-RELEASE.md records this. Own build jobs have ended, heartbeat78055999 was deleted, sessions and useful browser tabs stay open. No commit, push or public release was made.
