# Provider account identity

## Goal

Show the correct Codex brand icon for custom provider profiles derived from Codex, and let each provider account use its own selectable color so multiple accounts can be recognized at a glance.

## Findings

- **Verified:** `docs/custom-providers.md` documents multiple profiles extending a built-in provider.
- **Verified:** `provider-icon-name.ts` recognizes only the exact built-in ID or a supplied SVG; an unknown custom Codex ID falls back to `Bot`.
- **Verified:** the provider snapshot already exposes custom provider labels and SVGs, but not the source provider or an account color.
- **Verified:** the provider details sheet already reads and patches daemon provider config.
- **Verified:** `styles/identity-colors.ts` provides ten named colors with theme-aware foreground variants.
- **Inferred:** adding optional identity metadata to provider snapshots keeps older app/daemon combinations parseable and makes the selection visible anywhere the shared provider icon is rendered.
- **Verified:** the isolated dev daemon exposes the local test provider IDs `codex-test-one` and `codex-test-two`.
- **Unconfirmed:** color persistence and the inherited Codex mark have not yet been observed in the UI.
- **Verified:** `/home/admin/.codex/skills/jev-capability-advisor/SKILL.md` is installed at version 0.3.3. It recommends skills or MCP tools from the current session inventory; automatic host integration requires separate opt-in, network access and processing consent.
- **Inferred:** use the advisor on demand for capability selection, not on every task. A Jev choice check for this scope favored on-demand use (confidence 0.73).
- **Verified:** the Karpathy repository contains one `CLAUDE.md` with guidelines for stating assumptions, keeping changes simple and surgical, and defining verifiable goals.
- **Inferred:** use compatible parts as an optional coding checklist. Do not replace PandaOS or user-wide rules with the whole file; a Jev choice check favored selective use (confidence 0.98).

## Decision

Use the existing identity palette in the provider details sheet. Persist the selected color per provider in daemon config. Include that color and the inherited icon provider in optional snapshot fields so every shared provider icon can render the account identity. Use the selected account color only for its provider mark.

Apply the linked Karpathy guidelines as an implementation trial: keep this change narrow, preserve existing component/data boundaries, and verify the behavior against concrete acceptance checks. Do not install the guidelines globally or treat one feature as evidence for every future PandaOS change.

## Intended outcome

- Custom Codex-derived providers resolve to the Codex icon rather than the robot fallback.
- A provider details sheet can select one shared identity color or clear the color.
- The selection is stored per provider and appears consistently wherever that provider icon is rendered.
- Existing configurations and older peers continue to parse the optional data.

## Acceptance checks

- Build, targeted typecheck and lint pass once.
- A real app/browser run opens provider settings, assigns and clears a color, and shows the inherited Codex mark with the account color.
- The end-to-end run saves a screenshot and records the actual result here.
- Report separately whether the Karpathy guidelines helped this focused change and whether they should be adopted for PandaOS globally.

## Affected areas

- Protocol provider config and optional provider snapshot metadata.
- Server provider registry/snapshot construction.
- App provider identity cache/icon resolver and provider details sheet.
- English provider settings strings.

## Current checkpoint

- **Verified:** the previous session reported a passing build, app/server typechecks and targeted lint.
- **Verified:** the isolated worktree daemon is running and the active devtunnel works from the Mac (`HTTP 200` from `http://localhost:3045`).
- **Verified:** the browser test engine runs on the Linux daemon: Mac-only `localhost:3045` returns connection refused there, host port `4045` is blocked as unsafe, and the safe workspace app proxy returns 404 because its `app` script is stopped.
- **Verified:** `paseo.json` configures the workspace `app` script to use a separate daemon endpoint on port `6768` and the same `.dev/paseo-home`. Its paired daemon script is stopped; starting both would interfere with the active test daemon.
- **Unconfirmed:** account colors, icon rendering and the final screenshot have not been verified in the UI.
- **Next:** attach the Mac browser automation host to this workspace, then complete and save the browser flow. Leave the active devtunnel and main daemon unchanged.
