# Generative interactive UI

Branch: `feat/generative-ui`. Worktree: `/home/admin/projects/pandaos/.worktrees/generative-ui`.

## Goal and acceptance

Isolated optional plugin for provider-independent validated interactive timeline surfaces, with a cost simulator. Preserve normal chat, permissions and wire schemas. Verify schema, invalid input, streaming, history, interactions and restoration. Exercise web, Android and installed desktop with actual evidence or concrete platform blockers. No merge, push, production enablement or restart.

## Architecture and compatibility

The plugin uses pinned json-render core/native0.21.1, Zod4.4.3 and MCP SDK1.29.0 in a plugin-local lockfile. Expo54/React19.1/RN0.81.5 meet upstream peer ranges. A2UI0.9.1 researched as a distinct possible adapter; no interoperability claimed. Primary references and setup are in the plugin README.

Public timeline transforms project complete assistant fences or completed present_ui tool outputs into version1 plugin rows. Original canonical history remains the recovery source. MCP uses a separate stdio server because the public server SDK has no MCP registration method. No app/protocol/upstream changes or automatic agent reconfiguration. Native controls use PluginTheme and SDK controls. Fixed bounded DSL synthesizes a closed renderer catalog with includeStandard=false. No generated JavaScript, HTML, URLs, shell commands, network actions or permission approvals.

Explicit save/reload uses existing plugin RPC authorization, private atomic files and compare-and-swap versions. Identity includes host installation, agent, source and full snapshot. Local unsaved edits are ephemeral. Validation checks finite calculations on save and restore. Source inspection overrides stale docs claiming timeline annotations are memory-only; this implementation uses canonical message replay instead.

## Review

Read-only advisor8a8ba3b8-f48c-4427-a7f0-04380722a0e8 reviewed architecture and final deltas. Corrected missing source IDs, mixed Markdown preservation, decimal-comma/negative input, invalid calculated persisted values and stale restore responses. Final follow-up found Markdown inside the fallback prefix could still lose links; assistant projection now conservatively retains formatted prefixes in the original renderer, with six added regression cases (including plain decimal amounts). Final source verified after this change; see automated verification.

## Automated verification

- #1598: typecheck, lint, standalone MCP build, actual public plugin compiler and24 focused tests all passed.
- #1599: final restore acknowledgement UI change formatted/typechecked/linted/compiled successfully.
- #1610 final review: lint/build/compiler and30 tests passed; a newly added assertion accessed generic plugin JsonValue incorrectly and failed typecheck. Corrected the assertion. #1612/session34213 then passed format, typecheck, lint and30 tests and reloaded the private test plugin. Final chat browser_test evr_26b2baac-6b26-4c69-b391-ec46ab5fe6ca passed with0 console errors/failed requests.
- No full monorepo suite or CI run. No core source changed.

## Web evidence and Delivery Gate

Paseo browser_test ran against a private real test daemon with a mock-provider completed timeline response; no provider credentials or live inference used. Both standalone demo and actual chat timeline worked. Final repeatable simulator run evr_85c60ec6-d20c-44fc-af5e-bd8ac675e2ff and actual timeline run evr_523101e2-40ea-4e6f-9681-e5e2dc87e030 passed, consoleErrors0/failedRequests0. Both explicitly leave the surface and reopen it to verify saved inputs.

- Calculation10000 requests ->$80,20000->$140, slider increment21000->$146; decimal comma1,5 works. Invalid negative tokens show an inline error and suppress output.
- Save/reset/reload/remount verified. Injected ENOTDIR on only the private test plugin data directory showed a visible error (evr_271dea33-a204-49de-9e1a-4b9aeaef73b2), followed by successful recovery (evr_0999e838-1bbf-44bc-a625-12949f17356e). Fixture restored in finally; backup directory absent afterward.
- Wide and390px compact layout passed, no document horizontal overflow; inspected actual screenshots. Light/system and Dark host tokens verified (evr_09d307fc-826e-40da-9437-b0b333cf1ea2). No decorative assets or motion; illustrative numbers clearly labeled.
- Real Tab/Enter moved focus from numeric input to Reset and activated it;2px focus outline observed (evr_7a07faf2-683f-4db2-8d28-58b482190cc0). Slider DOM MouseEvents changed60000 requests/$380 (evr_3f7ae753-000c-458c-93fa-d8f92f311e95); synthetic mouse evidence does not prove native touch.
- Screen reader, full contrast audit, iOS and Mac hardware remain unverified. Code comment hygiene: no explanatory comments added. Responsive controls, invalid state, storage error, keyboard focus and dark theme checked; native gate pending.

Evidence files: `/home/admin/.pandaos/artifacts/wks_2141129804ebe4ec/<run-id>/`. Reusable parameterized simulator/timeline recipes moved into this branch's paseo.json; only this task's eight auto-saved keys removed from the main checkout. Diagnostic result-only checks remain evidence, not shipped recipes. Main config backup retained under .dev.

## Platform verification and blockers

Android is not verified. #1600 and explicit ARM64 translation probe#1617/session63054 both installed the existing APK into a read-only API34 x86 test emulator but crashed before JS: SoLoaderDSONotFoundError, missing libreactnative.so. #1617 explicitly selected arm64-v8a; SoLoader still searched an x86_64 APK source. Screenshots/logs are under .dev/generative-ui/android and android-native. Both bounded emulator fixtures exited. No physical device app or UI was changed.

Fresh x86 build#1605 failed after12m35s because worktree app dependencies had not been built (@getpaseo/highlight/dist missing). Its test-script restore trap used a relative path after cd; app package.json was manually restored and verified identical to backup, trap corrected. #1611 built highlight/protocol/client but failed the existing public plugin SDK build on ACP typing errors in packages/server/src/server/acp-internal/connection.ts (closeSession/compaction_update/name). No upstream source patched. Runtime dist files were emitted; #1613/session55486 then used these artifacts, passed the missing-module resolution, but failed Android JS bundling at the guarded2GiB Node heap: exit134, JavaScript heap out of memory, build failed after2m50s. No host limits increased. None of these failures is counted as native plugin success. A final read-only version query#1618 found the already-connected phone offline; no app install/launch/control on it occurred. A compatible reachable test device/build environment is required for the remaining native flow.

Installed Linux desktop baseline smoke#1602 failed before launch because /opt/PandaOS/resources/icon.png is missing. Targeted real installed-Electron retry#1607 showed client0.11.0 refuses plugin requiring>=0.11.2. The original version gate was preserved. Separate installed-Electron fallback flow#1615/session62229 PASSED: original assistant prompt, plain fallback and pandaos.ui data remained in ordinary chat, with no incompatible Requests textbox. Result and screenshot: .dev/generative-ui/desktop-feature/{fallback-result.json,text-fallback.png}. Both tests used isolated home/userData and closed only their own native test process. Installed files and user windows unchanged. Interactive desktop UI needs a compatible client. Mac desktop and iOS not checked.

## Final review state and resources

Prototype implementation and local web/MCP verification are complete; native/platform approval remains blocked as above. Source typecheck/lint/30 tests and host compiler passed. No full monorepo test suite or CI run. No commit/push/merge/deploy or production restart. Review uses the branch working diff and generated patch, preserving the existing pre-commit gates rather than bypassing their full-workspace typecheck.

All own verification queue jobs have finished. Heartbeat012a4bf3 is removed after the final documentation check because no external job remains; continuation requires an available compatible native test target. Preview terminal27f7bfa6-d743-4b01-8a3a-981bb3e21b8b stays open, private test daemon at127.0.0.1:45739 with home .dev/generative-ui/preview-home/.paseo. Server srv_X1YEacRKekOZ, workspace wks_fa462c2ff6a447c7, mock agent466bb8c8-fb44-4fee-a86c-f11f731102bb. Browser1792462351787-3371fd998f49a3dd and advisor8a8ba3b8 session stay open. No production plugin installation performed.

Tooling-only symlinks node_modules, packages/app/node_modules and packages/server/node_modules are excluded from the patch. Generated Android/.dev files remain ignored. Main checkout peer changes preserved, and this task's temporary browser recipe entries removed without rewriting other entries. Storage error fixture restored and backup absent, verified directly.
