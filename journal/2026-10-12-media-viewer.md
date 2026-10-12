# Media viewer — 2026-10-12

## Outcome and scope

Built-in picture/video plugin in `plugins/media-viewer`, registered in the daemon's built-in registry. Updated hosts load it even with optional plugins disabled. The workspace owns the viewer tab's host and RPCs. The app SDK exposes cross-platform `MediaView` and `saveMedia`; existing WebView/FileSystem/Sharing dependencies cover native clients.

The user also requested viewing across hosts, downloading onto the client and agent awareness. The workspace + menu and Command Center open an independent Media viewer tab, beside Chat and Browser. `/media <absolute path>` opens a file in that tab on the composer's workspace host. The plugin's `agent.create` hook preserves the existing system prompt and adds media delivery instructions for new agents.

## Limits and decisions

- Individual files are limited to64MiB. Reads use192KiB chunks, with stable file revision checks and base64 alignment. This avoids large WebSocket frames. Changed, empty, oversized, missing and unsupported files return actionable errors.
- Native playback loads cached player HTML by file URI with read access restricted to that video's directory. Closing the viewer removes it. Shared files remain readable by recipient apps; subsequent saves remove matching cache copies older than24hours.
- Video codecs depend on the client. Windows/macOS portability follows Node path handling and existing cross-platform runtime dependencies; physical remote hosts and native devices were not tested.
- Production daemon6767 was not restarted. Existing user/peer changes and agent/browser sessions remain intact.

## Verified acceptance

Job `d011da804e5942c194c963dfc94914d0` (#228) completed exit0: format, built-in/app typechecks, scoped lint, four file-boundary/chunk tests, server build and web app build. Earlier contract/lint failures were corrected. The read-only advisor6fc29666-cd13-4cc3-936a-b0828f7fcdf2 found the two native file-handling risks above and confirmed the fixes at source level; no repeat build/test was launched by that agent.

Two isolated preview daemons are running with optional plugins disabled: first42689/srv_6dly1jO9ZsBw and second44083/srv_MwP4pfwd979k. They are two actual daemon identities on the same Linux machine, not physical remote-host evidence. Both are launched through managed scripts in workspace wks_705dcec3d6071dcb with separate homes. The second uses OS-assigned port0 because the current daemon's cached service-port plan rejected a later added service. Browser1791831071862-681cbb70fa215c79 stays open.

Passing browser recipes/evidence:

| Recipe                            | Evidence                                                                 | Checked                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| media-viewer-image-download       | evidence://wks_705dcec3d6071dcb/evr_14aea678-52f5-45ea-b306-a981a75ad0f9 | Picture loaded960×600, zoom150%, reset100%, download dispatch. Zero console errors/failed requests. |
| media-viewer-video-download       | evidence://wks_705dcec3d6071dcb/evr_c77f5ac5-8400-4a25-bb44-d5aa73d0a446 | Video view and download dispatch.                                                                   |
| media-viewer-error-recovery       | evidence://wks_705dcec3d6071dcb/evr_e903b866-c0ec-4fe8-919e-d0927f1ba502 | Corrupt video shows decode error, missing file shows ENOENT, retry loads picture.                   |
| media-viewer-second-host-download | evidence://wks_705dcec3d6071dcb/evr_403528f2-52d3-41ab-878d-366e6596adba | Host picker switches URL to second serverId; picture and download remain available.                 |
| media-viewer-compact              | evidence://wks_705dcec3d6071dcb/evr_b11278a8-1540-4b39-90fb-82b43e05bfb8 | 410×820 viewport, download, zoom and reset.                                                         |

Native video controls are not exposed by this browser snapshot engine. Took over the uncertain browser_test on the same tab: focus video and press Space, measured time0→0.74949seconds,960×540decoded frame, then pause/seek2seconds. Download-control payload has1,374,742bytes and SHA25681ee62f4224e33ff3e69c2a2d97281f2ec7b8e315375563e345792dfa6682897, identical to source. This proves dispatched download bytes, not the user's completed filesystem save. Later recipe log counts retain one media blob request from the uncertain video run; browser_logs identifies the media blob, while decode/readiness/playback and complete download payload were verified. It was not a failed host RPC. No claim of zero failed requests for those later runs.

Initial UI checks exposed limitations in the running browser engine: privacy redaction altered the sample filename, image snapshot labels ignored alt text, and generic CSS refs for the host picker were not unique. Renamed only own fixtures and used exact DOM controls during takeover. No core automation changes were made for this task.

## Own-tab correction requested by user

The user clarified that the viewer must be its own workspace tab like Browser. Converted the contribution to addWorkspacePanel; the + menu, workspace Command Center and /media now open that panel. Removed full-screen/sidebar registration. The panel starts in its workspace directory; a per-installation/workspace path selection lets /media target a file while preserving the chat tab. Each workspace tab retains its workspace host. The prior screen-specific recipes/evidence are historical and do not validate the new tab entry points.

Acceptance: + opens Media viewer as a tab beside an existing chat/draft or Browser tab, switching tabs preserves content, media loading/zoom/download still works, and /media opens the same tab on its chat host. Correction job96462cbebb874a459629b4fb3ee22161 (#298, exec40508) completed exit0: format, built-in typecheck, plugin lint and server package build. App code is unchanged from the previously tested build. Managed source-root tab preview runs41767/srv_1CLv0GamZHy5 with workspacewks_ed5fa883ab7103e7. Actual + menu click opened Media viewer beside New Agent draft, and /media clip.mp4 switched to the existing viewer tab while preserving the draft. Preview CLI lists zero agents after the command, so no inference was started. Input, picture zoom150%, download and tab coexistence were verified. Browser automation required takeover for a menuitem and tab button because the running core engine emitted nonunique CSS refs; core draft input telemetry logged notifyInputActivity UUID validation when typing into the draft. This log is outside the plugin flow and is recorded, not claimed green. Passing tab recipe media-viewer-own-tab: evidence://wks_705dcec3d6071dcb/evr_d531541f-74ea-4879-b2d7-19a2e67ff32b, screenshot media-own-tab-next-to-chat. It verifies both tab buttons, file download dispatch and workspace URL. Manual takeover verified actual + entry and /media invocation; the recipe restores the existing tab layout. Video decoder readyState4/duration4/errornull. Known log counts1console/1blob request recorded. Obsolete screen-only recipes removed; their historical evidence remains in this report. Both own-tab advisor findings were corrected and confirmed at source level. Main activation remains unapproved.

## Final own-tab regression verification

Advisor found two source cases: repeated /media A after manually opening B could leave B because the store snapshot was a string; Back from an initial direct file could show an empty folder. Fixed with a stable per-workspace selection carrying an incrementing revision, and Back browsing the saved/default workspace directory. Job430b4ca9b8fb4985bf19ff0b6b012d5f (#304) completed exit0: targeted format, built-in typecheck, plugin lint and server build. Advisor confirmed both fixes at source level. Report/recipe formatter#303 also passed.

Reloaded only the isolated zero-agent media-tab-preview through its managed script. It now runs34495/srv_1CLv0GamZHy5, same workspacewks_ed5fa883ab7103e7. Main6767 was not restarted. Browser1791835314058-ec0e521112ac6d93 remains open at the new preview URL.

Real manual takeover after browser_test navigation timeout verified initial direct /media picture.png loads960x600; Back loads /home/admin/projects/pandaos including packages and plugins. Repeated identical /media picture.png after manually opening clip.mp4 displays the picture again, with no video element. Switching Chat and Media viewer retains picture and150% zoom. No user agent or browser tab was closed.

Saved passing recipe media-viewer-own-tab-regression: evidence://wks_705dcec3d6071dcb/evr_922f0d7d-8910-4d9d-9368-890b4995953e, screenshot media-tab-picture-next-to-chat. Checks image open,150% zoom,100% reset, Back directory list, both tab buttons and download dispatch. The recipe restores the existing panel layout; manual takeover covers the actual slash-command regression. Retained browser logs contain9errors:5 old-port reconnection failures during the isolated preview reload and4 existing draft-input UUID telemetry errors;2media blob entries reflect rapid video switching. No claim of zero log errors. The failed first run and strict-selector errors belong to the running older browser engine; takeover completed the flow.

## Delivery state

The user approved main-daemon activation with "gerne". The own-tab feature is now active on the Zotac daemon and its browser web client. Native iOS/Android playback/save, Mac/Android application rollout and physical remote-host installation remain unconfirmed. Linux Electron renderer files are installed; its already-running window was left open and has not been forcibly reloaded. No optional-plugin global switch was enabled.

## Authorized production activation

Prepared the scoped media delta on installed release71d8e733a in managed workspacewks_4024a837babb5ad1, /home/admin/.pandaos/worktrees/1deov5kv/media-viewer-activation. Only3tracked runtime/SDK/registry files,5new runtime modules and plugins/media-viewer were transferred. Peer dirty changes in the main checkout are excluded. Build#313 (6715ea54dd844f3abae796477e8b1f17) passed dependency installation/server/browser build;#316 (674ad7fd97144fb7bc76a76bc8f64e5d) passed built-in typecheck and Electron renderer export. Frozen release: ~/.local/share/pandaos-releases/71d8e733a-media-viewer.

Detached one-shot media-viewer-activation.service performed the authorized switch/restart. Main supervisor2638270 is healthy on6767, serverIdsrv_RtppvtlARpFR and daemon-keypair hash unchanged. All713persisted agent records, persistence handles and archive statuses are unchanged. Session Recovery resumed this turn automatically. Browser web UI was enabled through the supported config command and its bundled assets served by the live daemon. No application publication, commit, push or device rollout was performed.

Actual + menu opened Media viewer beside the existing Add video and picture viewer plugin chat tab and retained Browser/terminal tabs. Saved passing production recipe media-viewer-production: evidence://wks_705dcec3d6071dcb/evr_a02b6179-b44e-43ef-abd1-ba377b45d6b4, screenshot media-viewer-live-main. Picture960x600, zoom150%, reset100%, chat retained and Download dispatch verified;0console errors/0failed requests.

Saved passing media-viewer-production-video: evidence://wks_705dcec3d6071dcb/evr_f4e6a660-3add-4ce1-9563-88efb1b05f9d, screenshot media-viewer-live-video. Download dispatch verified;0console errors and2retained media-blob entries during player switching, not host-RPC failures. After browser_test could not expose native HTML video controls, manual takeover focused the video and pressed Space: time0 to0.579711seconds,960x540decoded frames, duration4, readyState4/errornull; paused and sought2seconds. Blob payload1,374,742bytes, SHA25681ee62f4224e33ff3e69c2a2d97281f2ec7b8e315375563e345792dfa6682897 equals source. This verifies dispatched bytes, not the user's completed filesystem save.

Linux Electron app-dist was updated with a separate Electron export; installed index SHA25632f88e300331d2d9e0e893df98d2035af78ad09bc097b2e6dbffa131bd6a69fe matches the built artifact. The existing desktop process/window stays open; a reload loads these new renderer assets. Old renderer and daemon release remain available for rollback.

The restart stopped managed preview terminals; all3own preview scripts were restored through PandaOS. Tab preview now37015/srv_1CLv0GamZHy5; existing preview browser1791835314058-ec0e521112ac6d93 was navigated to the new URL and stays open, as does live browser1791837327471-145c0f2d01f733e8. All agent sessions remain unarchived. Durable receipts: .dev/media-viewer-qa/activation.json and session-preservation.json. Heartbeatf893ff5d is removed after final formatting.
