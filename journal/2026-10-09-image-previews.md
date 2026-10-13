# Image previews in assistant messages — 2026-10-09

## Audit

- **Verified:** The user reports that loaded screenshots make the transcript very long and supplied a screenshot showing a large assistant image in the transcript. The working-tree diff changes `AssistantMarkdownImage` from rendering at its measured aspect ratio to a capped preview with an expand/collapse control.
- **Verified:** Assistant-message height estimates in `packages/app/src/utils/assistant-image-metadata.ts` use the same image metadata and feed transcript virtualization.
- **Inferred:** A bounded inline preview with in-place expansion will keep long transcripts scannable while preserving the full-resolution viewer.
- **Unconfirmed:** The visual result on the running app has not been checked yet.

## Decision

Cap the collapsed image preview at 640 × 360 CSS pixels, expose an accessible expand/collapse button only when the image exceeds that bound, preserve tap-to-open lightbox behavior, and use the same cap in virtualized height estimates. Add translated control labels to every current locale.

No user decision is needed for this slice.

## Roadmap and acceptance

1. Review the existing working-tree implementation and fix any layout or sizing mismatch.
2. Build once, check the affected flow with PandaOS `browser_test`, then run typecheck and lint once.
3. Record the evidence and any remaining device or deployment gap below.

Acceptance: large assistant screenshots render at no more than 640 × 360 pixels when collapsed, expand to the message width, collapse again, and still open in the existing lightbox. The height estimate uses the collapsed dimensions so transcript scrolling remains stable.

## Checkpoint

The requested implementation was already present as uncommitted changes when this task resumed. Reviewed and corrected the preview sizing so the collapsed width follows the source aspect ratio and the 640 × 360 cap; the disclosure appears when large images load, and the virtualized height estimate uses the same cap.

- **Verified:** `npm run build --workspace=@getpaseo/app` passed.
- **Verified:** `npm run typecheck` passed after the sizing correction.
- **Verified:** Targeted `npm run lint` passed for the changed app sources; `message.tsx` was linted again after the correction.
- **Verified:** PandaOS `browser_test` passed on the isolated dev daemon. It expanded and collapsed the assistant image, opened and closed the lightbox, and reported zero failed requests. The browser run reported five console errors, which were not asserted or traced in this feature test.
- **Verified:** The passing flow was saved as the `assistant-image-preview` browser recipe. Evidence: `evidence://wks_f01a0cf9ddaa365b/evr_7dbef95f-e980-49ef-9492-100a37cf0086`.
- **Not confirmed:** Native iOS/Android rendering and a production or Mac installation were not checked.

Acceptance is met for the tested web flow. No production daemon or device was changed.
