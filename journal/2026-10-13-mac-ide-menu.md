# Mac IDE toolbar — 2026-10-13

## Outcome and scope

VS Code icon and dropdown are implemented and verified for a configured remote SSH workspace. The main button hands the real Zotac folder or active file to VS Code on the Mac using Remote SSH. Local editors and GitHub retain their existing behavior. User approved installation and restart. The candidate is installed and signed on the Mac. PandaOS and its local daemon restarted with the same server ID.

The screenshot originally showed only GitHub because installed desktop editors were restricted to the desktop-local daemon. Checked Mac has VS Code, IntelliJ IDEA and the Remote SSH extension. Rider was not found. The `zotac` SSH alias connects successfully. App host profile must include a default-port remoteSsh connection; direct/relay-only profiles and custom SSH ports remain outside this slice.

## Verification

- 23 focused existing-suite tests, app/desktop typecheck, scoped lint, desktop compile and first export passed in queue job372c734052ee412eb92f8dff4d2e4890 (#640). No broad suites run.
- Advisor97ba09bf-d3f8-4faa-b16e-847a2fd00562 found no blocking defect.
- Final clean renderer export passed job4e31a560d7964989b4d2d31a7713c35c (#665), after correcting temporary snapshot dependency paths. Source snapshot is HEAD2d3042380 plus12 owned files, with existing built dependencies. It is a temporary artifact within the existing workspace, not a separate worktree. Unrelated dirty peer work is excluded.
- Exact candidate is index-b82bff9407fd470d5622a60eb4c04699.js. Fresh browser1791921127536-ee3b0672906672dd passed direct primary-button and caret clicks. Both VS Code and GitHub rows are visible. Recorded request has editorIdvscode, remoteSshHostzotac and workspacePath/home/admin/projects/pandaos. No console errors and no network failure entries in this fresh page. Screenshot evidenceevr_38e513fd-e021-4657-9abc-2be80e3c21ae; raw proof is .dev/mac-ide-menu/fresh-browser-proof.json. The editor bridge is mocked; daemon, workspace and checkout queries are real.
- Scripted recipe `mac-ide-final-candidate` passed in evidenceevr_54cdc3c5-3c5a-4728-ad7b-3a8cc8adfec6. It allows2 retained exceptions from the older a4458ffd bundle. Strict reruns reused that same old tab and its old exception history even after navigation. Fresh-page takeover above independently confirms zero errors. Do not represent the retained errors as current-candidate errors or this test as native Mac evidence.

## Delivery

Prepared .dev/mac-ide-menu/mac-ide-menu-update.tgz, installation script,51-file checksum manifest, original Mac ASAR and rollback procedure. Original ASAR SHA2564007dacdbacf1e96a5777054b310a85f305e60e132f966fc05f1cae15160dd74. Candidate SHA2565393fce10cd32f5a0251292c1a42af9218cb36ee7c3b73efe218f2a4227cd886. Only four editor/preload modules change; all original packed payload bytes and unpacked-file metadata remain intact. macOS ASAR integrity uses the header JSON digest, verified against the original Info.plist. Candidate signed on the Mac using the existing PandaOS Local Signing identity; codesign verification passed.

Activation completed with original-hash guard and backup under /Users/mau/Library/Application Support/PandaOS/rollout-backups/mac-ide-menu. Delivery SHA256 aa06e2038a42fef1ae934e9da9c6592e053a3a659e8ffdd79e2552a24fb1d8bd, stored in /Users/mau/Downloads/pandaos-mac-ide-menu. Installed ASAR and renderer hashes match the prepared artifact. Native accessibility confirms Open workspace in VS Code and Choose editor on a Zotac workspace. No local Mac agents were active before restart. User requested the new restart plugin; its launcher requires Linux systemd and the plugin was absent on Mac, so the approved desktop restart used normal app quit/open. Main Zotac daemon was not restarted.

Actual packaged registry, VS Code target and spawn runtime launched VS Code on Mac for /home/admin/projects/pandaos with ssh-remote+zotac. The headless probe substitutes only unused Electron app/shell imports. VS Code Remote SSH logs confirm authority resolution and exec-server creation; workspace.json confirms vscode-remote://ssh-remote%2Bzotac/home/admin/projects/pandaos. Native UI button automation was unreliable and is not a passed click test; browser candidate tests verify primary/caret behavior and request payload. Raw safe evidence is .dev/mac-ide-menu/mac-native-proof.json. Agent sessions and localhost previews remain open. No pending queue jobs or heartbeat.
