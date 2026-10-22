# Generative interactive UI prototype

Optional PandaOS plugin. Agent output becomes a bounded native control surface inside its existing timeline row. Ordinary chat, permissions and protocol messages keep their current behavior. The built-in demo estimates monthly usage cost from illustrative assumptions; it does not fetch provider prices.

The implementation uses `@json-render/core` and `@json-render/react-native` **0.21.1**, pinned in the plugin-local lockfile. React, React Native and the plugin SDK come from the app. No app-wide dependency or native module is added.

## Run in a review environment

From this directory:

```sh
pandaos-android-queue -- npm ci --workspaces=false --legacy-peer-deps --ignore-scripts
pandaos-android-queue -- npm run typecheck
pandaos-android-queue -- npm run build
```

Install this directory into an **isolated test daemon** using the existing `pandaos plugin install` command. Enable plugins on that daemon through its existing configuration. Production enablement remains a separate user decision because plugins themselves are trusted, unsandboxed extensions. Open **Open cost simulator** from the Command Center. This plugin does not restart the daemon.

Run the focused suite through the repository's existing Vitest runner:

```sh
pandaos-android-queue -- npx vitest run plugin-examples/generative-ui/surface.test.ts plugin-examples/generative-ui/server/mcp.e2e.test.ts --bail=1
```

The repository browser recipes `generative-ui-cost-simulator` and `generative-ui-timeline` accept `demoUrl` or `chatUrl`, `launcherUrl` (the same test app’s `/open-project`) and `readyText` (`Using initial inputs.` for fresh state, `Saved inputs loaded.` for previously saved state). The timeline recipe requires a completed assistant message generated with `surfaceText(costSimulator)` and the prompt `Show the illustrative cost simulator.`. Each recipe explicitly saves test inputs, leaves the surface, and returns to check restoration. Run them only against an isolated fixture.

## Agent submission

Preferred: configure a stdio MCP server on the agent's host. All providers that support the existing `mcpServers` configuration can use the same `present_ui` tool:

```json
{
  "pandaos_ui": {
    "type": "stdio",
    "command": "node",
    "args": ["/absolute/plugin/directory/dist/mcp.mjs"]
  }
}
```

Use the actual producing host's absolute directory. The server validates the complete snapshot and returns both `structuredContent` and readable text containing the same `pandaos-ui` fence. Tool calls remain subject to the selected provider's existing permissions; the plugin never preapproves tools. Existing running sessions are not silently reconfigured. This MCP server neither saves inputs nor performs actions.

Without MCP, emit one standalone assistant message containing a fenced `pandaos-ui` JSON object, optionally preceded by its exact plain-text `fallback`. Its shape is defined by [shared/surface.ts](shared/surface.ts); [shared/demo.ts](shared/demo.ts) is a complete cost-simulator example. Use a unique `id`, `version: 1`, and increment `revision` whenever the snapshot changes. Keep surrounding Markdown in ordinary chat messages. Messages with other surrounding content or without a stable `messageId` remain entirely in PandaOS's original renderer so links, images and file downloads retain their behavior.

Clients without this plugin see the original text/tool result, including the fallback. Unsupported versions, malformed JSON and incomplete fences are left untouched. Successful MCP responses should not be repeated as a second assistant UI message.

## Contract and architecture

```text
Agent text or present_ui result
  -> existing canonical timeline and provider normalization
  -> plugin transformer validates PandaOS UI v1
  -> native renderer adapter synthesizes a flat json-render Spec
  -> closed component registry, existing PluginTheme and SDK controls
```

The wire format is a PandaOS-specific, versioned DSL, not raw json-render input. It contains up to 16 numeric inputs, 32 ordered calculations and 32 blocks. Blocks are notes, formatted metrics, bounded tables and labeled bar charts. Tables also express comparisons; grouping these blocks forms a dashboard or numeric form. Calculation references must point to existing inputs or earlier results. This prevents cycles and arbitrary-depth expression trees. The only operations are sum, product, difference and ratio. Values must remain finite; invalid input hides calculated output and shows an inline error.

The adapter constructs every component type and prop. Generated data cannot supply `on`, visibility, repeat, state bindings, JSON pointers, component names, URLs, markup, code or renderer actions. `includeStandard={false}` disables json-render's default components. Although upstream ActionProvider contains built-in actions, none can be addressed by this DSL or the adapter. Native Text renders labels literally. The only user actions are local reset, explicit save and reload of saved inputs. No agent message, shell command, navigation or network operation can be generated.

Payloads are capped at 48 KiB of UTF-8. Counts, label lengths, table dimensions, numeric ranges and step precision are validated before rendering and MCP completion. The renderer validates again through the plugin API. Only trusted plugin source runs JavaScript; generated data never becomes executable source.

## Streaming, history and saved inputs

Each complete snapshot is atomic. Partial JSON remains text until a closing fence and valid snapshot arrive. A valid standalone surface can become interactive during streaming. Adding other prose or formatting restores the original chat row. Replaying canonical history deterministically reconstructs the same surface without executing actions.

Saved input identity includes the installation's isolated data directory, agent ID, source message/tool-call ID and the entire versioned surface. Prefix/suffix streaming changes do not reset edits. A changed revision resets the form and gets a separate saved-input record. The server atomically writes a private JSON file only after an explicit **Save inputs** click and validates calculations on both save and restore. Compare-and-swap revisions reject stale writes from another client. Restore/save failures remain visible; **Reload saved inputs** retries and explicitly replaces local edits. Unsaved edits are intentionally local and are lost on remount. Plugin removal does not rewrite chat history.

Plugin RPCs retain PandaOS's existing `daemon.manage` authorization. The prototype does not add permissions, approval flags, automatic follow-ups or protocol fields. It does not implement record deletion or retention policies; saved demo/interaction records remain in the installation data directory under the host's normal plugin data lifecycle.

## Compatibility research

Verified on 2026-10-20 against primary sources:

| Dependency                                                                                                       | Published version         | Compatibility evidence                          |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------- |
| [core registry](https://registry.npmjs.org/@json-render%2fcore/latest)                                           | 0.21.1                    | Zod 4 peer                                      |
| [React Native registry](https://registry.npmjs.org/@json-render%2freact-native/latest)                           | 0.21.1                    | React 18/19, RN >=0.71, Zod 4 peers             |
| [Official Expo example](https://github.com/vercel-labs/json-render/blob/main/examples/react-native/package.json) | Expo 54 family            | React 19.1 and RN 0.81 family match PandaOS     |
| [A2UI specification](https://a2ui.org/specification/v0.9.1-a2ui/)                                                | 0.9.1, current production | Separate surface/component/data-model lifecycle |

Peer ranges permit this Expo stack; they do not prove Hermes or platform runtime behavior. PandaOS compiles plugin bundles outside Metro, so native plugin evaluation requires its own check. The [renderer source](https://github.com/vercel-labs/json-render/blob/main/packages/react-native/src/renderer.tsx) and [action implementation](https://github.com/vercel-labs/json-render/blob/main/packages/react-native/src/contexts/actions.tsx) informed the closed-catalog boundary.

A2UI 0.9.1 is a possible future adapter, not implemented interoperability. Its `createSurface`, `updateComponents`, `updateDataModel` and `deleteSurface` messages and `application/a2ui+json` format differ from this atomic snapshot contract. Supporting it requires explicit catalog/state mapping and conformance tests. No partial A2UI support is advertised.

Actual validation results and platform limitations belong to [the task journal](../../journal/2026-10-20-generative-ui.md).
