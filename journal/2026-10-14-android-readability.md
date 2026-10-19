# Android chat readability

## Verified cause

The supplied Android screenshots show pipe-separated tables, literal file links and partial diagrams. The original provider message contains valid Markdown. The same defects occurred in the live web app.

The enabled directory plugin `mermaid` at `/home/admin/.local/share/pandaos-plugin-releases/mermaid-95cf07db7` replaces the entire message whenever it finds a Mermaid fence (`index.client.tsx`). Its minimal Markdown renderer joins table lines as prose and does not resolve the local links. Its diagram parser skips subgraphs and several edge/node forms. The live React component ancestry confirmed `PluginInstallationProvider` with id `mermaid` and its `TextItem`/`Markdown` renderers.

## Applied fix

Disabled only `mermaid` using `pandaos plugin disable mermaid --host 127.0.0.1:6767 --json`. CLI and config readback both confirm disabled. The installed source remains available for rollback. The built-in Markdown/Mermaid renderer now handles the same unchanged conversation. No application data was removed and the daemon was not restarted.

The phone has sh.pandaos 0.11.0/code 11000 installed 2026-10-08. Its APK contains the built-in Mermaid runtime. The initially queued current APK build 792 / c5904df7f9494194ae6ad5d66c21ebea was canceled with exit 130 once the plugin cause was established; no APK was installed. Heartbeat a824d0c3 was deleted.

## Verification

- Desktop browser test `evr_6c025777-7264-43b6-a87f-1fbc8a0ab483` passed with zero console errors. Original source chat, five structured tables, local link labels, no pipe-delimited paragraphs.
- Compact 390x844 table screenshot: `evr_9c0e4b52-14e1-469c-8214-7baa16224886`. DOM readback: five tables, zero raw table paragraphs, accessible file links.
- Complete diagram including the Hetzner subgraph and full edges: `evr_cc2a7bce-be2c-4a48-b4ba-ce3b9e41a482`. Fullscreen opened through the visible DOM button after browser locator clicks timed out. Actual pointer-click behavior in that browser is unconfirmed.
- Native Android input injection is blocked by INJECT_EVENTS permission; device permission settings were not changed. Supported agent deep link succeeded (queue803), native screenshot `.dev/android-readability-native-chat.png` confirms parsed tables and local link labels. The old installed0.11.0 app still sizes table rows inconsistently and clips cell values. Peer follow-up session86e86d37 verified the installed APK matches `.dev/android-0ac9d5c21/PandaOS-0ac9d5c21.apk` and already contains the existing table-width helper. The hypothesis that upgrading alone fixes clipping is superseded. Peer owns a focused renderer/markdown-text-selection correction for definite initial table width and shared cell widths. Build807 / 944dd2b209e04242aa9984aedc5caad1 was canceled with broker cleanup and exit130 to avoid overlapping native writes. Heartbeat3bdb63b5 deleted. No APK installed. User question was dismissed; no manual navigation needed.

## Acceptance and limits

The live plugin rendering cause is fixed and browser behavior is verified. Native parsing is verified. The remaining native column sizing defect is owned by the user-started follow-up session86e86d37; its implementation and runtime evidence are required before claiming the full Android flow complete. Plugin disable alone is insufficient for native acceptance. The follow-up implementation is installed with explicit user approval. Native last-row wrapping and equal cell widths are verified; full-table inspection still needs the user to scroll because Android denies injected input.

## Native table follow-up (86e86d37)

User screenshots after plugin disable confirm single-line clipping and different column boundaries per row. Hypothesis: intrinsic native ScrollView/row sizing defeats flex-only cells. A full-width outer viewport now measures available message width; the inner table has a definite width from its first render; shared cells take the same percentage width in header and body. Preserve selectable text, copy metadata, theme and horizontal scrolling for wider tables.

Affected files: `components/markdown/renderer.tsx`, `components/markdown-text-selection.tsx`, `components/message.tsx`. Acceptance: same Michelin table fits the viewport with aligned columns and wrapped content; 3+ column tables scroll within the message; local links and full diagrams remain intact. Scoped typecheck/lint and diagnostic build passed. User approved installation and native inspection on2026-10-14. No daemon restart approved or performed.

Build814 / 650719e1cc5343b2972ae1a9d79f4135 failed after native compilation at `createBundleReleaseJsAndAssets`: V8 exhausted the explicitly configured2GiB Node heap, taskexit134/buildexit1. Retry817 uses one Metro worker and redistributes the same configured4GiB heaps to Node3GiB plus Gradle1GiB, with native build cache and unchanged host queue/cgroup limits. Source checks remain green; no source changes since those checks.

Optimized build817 was canceled (confirmed exit130/cleanup) after the compiler spent24min with only2m51 CPU and about70% memory pressure. A bounded diagnostic APK build uses the existing Hermes-O0 configuration, unchanged host limits and cached native modules. This candidate is for verifying the Android layout; its runtime performance is unconfirmed and it must be labeled as a diagnostic APK. No device update approved or performed.

Diagnostic819 completed successfully (Android2m42s and web export). APK `PandaOS-android-tabellen-pruefung.apk`, package sh.pandaos, version0.11.2/code11002, SHA25677095b736be34716231f0199be7ba2aac6b6b33bd5f8a5da22b1bd882a18a377. apksigner verified; signer exactly matches the installed phone app. Metadata queue820 passed. Scoped source format/lint/typecheck passed queue812.

New source web preview exported successfully, but its browser flow was rejected by the existing daemon Origin guard on8096 (403), evidence `evr_45fc0574-3f4a-4a01-b429-445fb2c3fdfc`; this is not a passed rendering test. No CORS/auth configuration was changed. User explicitly approved updating and checking the phone on2026-10-14. Queue855 install-r succeeded; package readback confirms0.11.2/code11002. Supported Michelin agent deep link opens the original chat with its data intact. Native screenshot `.dev/android-table-michelin-86e86d37.png` and UI hierarchy `.dev/android-table-proof.xml` show a complete wrapped last-row paragraph and equal cell text widths492px/491px. Scoped log readback found no matching fatal/ReactNativeJS error. Full-table header inspection remains pending a user scroll: queue859 input swipe was denied by device INJECT_EVENTS policy. No device permission changes. Diagnostic-O0 performance beyond successful startup is unconfirmed.
