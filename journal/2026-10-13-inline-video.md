# Inline generated videos — 2026-10-13

## Goal and delivery

Generated video links render a large player and Download directly in assistant chat; opening a separate tab is optional. The provided CCA Claim Intake master on the Zotac is the acceptance file. The implementation and isolated web acceptance are complete. Production/client rollout remains with the Host-Monitor session; this task does not restart or deploy the main daemon.

## Decisions and scope

Reuse the existing media-viewer host RPC and cross-platform MediaView/saveMedia. Normalize complete video links and video image syntax, preserve literal code and incomplete streaming links. Load on demand, with Download available before loading. Fill the available chat width up to960px. Read local files through the message host and workspace rather than the viewing device. Cap previews at64MiB; enforce chunk offsets, revision consistency, canonical base64 and cumulative encoded length before retention. Remote acquisition uses Expo streaming fetch with linked cancellation for native clients.

Own paths: assistant-video source/read, AssistantMarkdownVideo, assistant Markdown parser and existing parser/acquisition tests, message video rendering rule, media-viewer agent instruction and this report. Preserve peer image disclosure/locales, Tabs/browser lifecycle, composer/dictation and all other dirty changes. Shared QA script/recipes in paseo.json remain local.

## Verified evidence

- 56focused tests, app typecheck and scoped lint passed in queued job6dd15b9a849c4613b6657eca1c919267 (#390). Advisor6fc29666-cd13-4cc3-936a-b0828f7fcdf2 confirms native streaming, native block token, stale cancellation and canonical/aggregate chunk bounds at source level.
- Default and single-worker Expo exports failed exit134 at the unchanged2GiB Node heap (#385/#388/#390). Installed Metro WorkerFarm uses in-process transforms for one worker. Export with two worker subprocesses and --no-minify passed exit0 in queued job666f68d986894efcbf21ba3133b76d70 (#392),116s. No host or heap limits changed. This preview export is not minified.
- Isolated managed inline-video-preview uses a mock assistant timeline, real daemon/client/plugin RPC and the real supplied video. No provider inference or production state mutation. Preview port32865, server srv_2XuznM-V2pgJ, workspace wks_3162c6b397b48128, agent80cca371-11a1-4798-8e67-b6391edf20e6.
- Video loaded at1920x1080,14seconds, controls enabled,804x452px in the desktop chat. Actual play advanced currentTime to1.018s, pause succeeded and seek reached7s without decode error. Browser blob SHA256 matches the current Zotac file: d33622659cbc7928ea7190e56cc5a1948167a6a9ec1af03d20c2f2f4d8e251d6,5,471,601bytes. Download before loading dispatches successfully and shows its success notice.
- browser_test download/error recipe passed: evr_a6a7ce95-e8b0-42ba-9dc5-46b1939a153a; missing file shows ENOENT. Image expand/collapse regression passed: evr_719eb1cb-f9ff-4bfc-87e2-c064e21651e1. Both flows saved as recipes with screenshots. Zero console errors. Two network entries are old revoked blob media requests with duration0, not host/RPC failures. Initial cold-route/startup runs failed; takeover and warm workspace route resolved them.

## Limits and handoff

Native/Mac installed-client behavior and production inline rendering are unconfirmed. Existing standalone media tab activation was completed earlier; its scoped commit is9f242dc5af97f1aa9964521d7d08fe756ee03daf. The inline change is delivered separately on main with only its own paths and its own portion of shared message.tsx. Peer worktree bytes are preserved through a saved snapshot and guarded restoration. All sessions, tabs and managed previews remain open. Local checkpoint/commit receipt: .dev/media-viewer-qa/inline-checkpoint.json and inline-commit.json.
