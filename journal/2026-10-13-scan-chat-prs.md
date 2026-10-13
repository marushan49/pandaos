# Scan chat PR source

## Scope and decision

The screenshot showed PR #1517 in Google-Vids-Skill's chat while Scan chat was clicked on Review HAP Risk Phase 3 and CCA transition. Those are different workspaces. The user explicitly chose to scan the visible chat for the clicked destination row.

## Findings and implementation

Live transcript of source agent71bf5ef3-c116-46a9-b8c2-70d26b036953 contains candidate1517 twice. Live forge lookup in the destination repository confirms that PR. The prior scan chose up to three cached agents belonging to the destination workspace instead of the visible source.

The hook uses the active route's host client and its focused chat ID to read the transcript. It resolves candidates against the clicked destination's host and directory. The existing selection dialog remains the only path that attaches results. Explicit source PR URLs must match the resolved destination PR URL, preventing same-number collisions across repositories. Bare numbers are resolved in the user-chosen destination and shown for confirmation. Empty results with unresolved candidates show their numbers; transcript failures expose the error.

## Verification

Scoped format/lint and app typecheck #707 passed. Existing scan suite #708 passed8cases, including matching and conflicting PR URLs. The read-only advisor approved focus/host routing and the subsequent URL guard.

Build #706 failed at Node's2GiB heap limit after dependency compilation. Export #711,585a7cd07e3d4e639a5c425dd83db05d passed with one worker and no minification; host limits remained unchanged. Main daemon was untouched.

Real UI: selected Review HAP workspace, expanded its PR panel, opened Google-Vids via app Search, clicked the destination panel's Scan chat. The dialog showed1517, its current title, mentioned2x, open, and Attach1. No attachment was submitted. Initial browser_test clicks had ambiguous generated CSS selectors, so the actions were completed through the same tab's UI controls. Final browser_test assertions/screenshot passed and saved recipe scan-visible-chat-pr-1517-result. Evidence: evidence://wks_6494197b0c21af1e/evr_264fb36f-49fb-43bc-ac3e-ad6fd911f99e. Screenshot: /home/admin/.pandaos/artifacts/wks_6494197b0c21af1e/evr_264fb36f-49fb-43bc-ac3e-ad6fd911f99e/screenshot-visible-source-other-workspace-1517.png.

The test's11console errors were accumulated403WebSocket errors from the earlier stale preview page, before proxy boot was loaded. After explicit page reload the local preview proxy connected, loaded real workspaces/transcripts and resolved the real PR. The final run had0failed requests. Full native or device rollout remains unconfirmed.

## Delivery state

Source fix and verification complete. No commit, push, PandaOS PR, publication, daemon restart or production installation. Unrelated local changes preserved. The built preview includes the checkout's existing local edits and is not a curated production release.

The functioning preview remains open at http://127.0.0.1:43677/h/srv_RtppvtlARpFR/workspace/wks_c8a497912523ebf4. Its lightweight local server is exec96111, browser1791928735108-d25a21be884ae2db. Original live browser1791927831283-6df66e16364ab363 and advisor90dab469-4903-4b75-9d61-512303996fa5 remain open. Heartbeatf23baef4 deleted after completion. Queue coordination used the [paseo skill](/home/admin/.agents/skills/paseo/SKILL.md); the owner ended job702 normally after passing verification.
