# Painter AI — Demo Report

**Date:** 2026-05-24  
**Tester:** Claude (automated demo session)  
**App:** Painter AI (React/Vite frontend + Node/Hono backend proxy)  
**Backend provider:** codex-canvas → fell back to **mock** mode (no Codex auth present)

---

## Demo Recording

A 50-frame animated GIF of the demo session was captured using the Chrome tab recorder.

**File location:** `~/Downloads/demo-video.gif` (20 MB, 1407×840 px)

> **Note:** The GIF was downloaded to `~/Downloads` by the browser recorder. Move it into this repo folder manually if you want it version-controlled:
> ```bash
> mv ~/Downloads/demo-video.gif ~/Desktop/repos/Painter-AI/demo-video.gif
> ```

---

## What Worked Well

### AI Image Generation (Cmd+K CommandBar)
The CommandBar (`Cmd+K`) is the core generation interface and worked reliably throughout the demo:
- Whole-canvas generation: typing "sailing on a sunny day" produced a new AI layer immediately.
- Region-based inpainting: after making a selection, "a flock of birds" was inpainted into the selected region.
- **Variation picker:** the UI showed 2 side-by-side variations; clicking one committed it as a named layer.
- Layers were auto-named after the prompt text ("sailing on a sunny day", "a flock of birds"), making the layer panel readable and organized.

### Layer System
- The **Layers panel** displayed all AI-generated layers with thumbnails and prompt names.
- **Opacity slider** was accessible via the "…" overflow menu on each layer and responded smoothly.
- Layer order and visibility toggling worked as expected.

### Smart-Select (Sparkle) Tool
- Clicking the sparkle/wand tool on the canvas created an automatic 64×64 inpaint selection around the clicked region.
- A **floating toolbar** appeared above the selection with four action buttons: Generate, Remove, Reimagine, Restyle.
- This felt like the most polished feature — intuitive and responsive.

### Manual Painting
- The **brush/pencil tool** painted on the canvas with the selected color from the palette.
- Color picker and palette worked correctly.

### Undo / Redo
- `Cmd+Z` (undo) and `Cmd+Shift+Z` (redo) both worked correctly throughout the session, including undoing AI layer additions.

### Chat Panel
- The right-side chat panel logged all AI interactions and showed the full generation history.
- Conversational responses were coherent (though they don't trigger new images — see Issues).

---

## Issues Found During Demo

### 1. File > New Freezes the Tab *(open)*
**Severity: High**  
Clicking **File → New (1024²)** caused the Chrome tab renderer to become unresponsive for 30+ seconds (CDP timeout). This happened twice. The app had to be recovered by navigating back to `localhost:5173`. Recommend investigating the canvas reset path — likely a blocking synchronous operation or an unhandled promise rejection on canvas initialization.

### 2. Backend Running in Mock Mode *(open)*
**Severity: Medium**  
`server/.env` sets `IMAGE_MODEL_PROVIDER=codex-canvas`, but Codex auth (`~/.codex/auth.json`) was absent, causing silent fallback to the **mock provider**. The mock returns colorful circle/bubble placeholder images rather than realistic AI-generated content. There was no warning displayed in the UI indicating mock mode was active. Recommend adding a visible "Mock mode" banner or toast notification when the real provider is unavailable.

> **Partial mitigation:** The inpaint demo in `painter-ai-review.html` now shows an amber "warn" pill and tooltip when `/ai/health` reports mock mode.

### 3. Chat Input Does Not Trigger Image Generation *(open — by design)*
**Severity: Medium (UX clarity)**  
Typing a prompt in the chat input and clicking Send produced a conversational text response only — it did not generate a new image. Users unfamiliar with the app will naturally try this first. The actual generation entry point (`Cmd+K`) is not prominently surfaced. Recommend adding a hint or placeholder text like "Press Cmd+K to generate an image" near the chat input, or wire the chat input to trigger generation when a prompt is entered.

### 4. Rectangle Selection Tool Drag Had No Effect *(likely resolved)*
**Severity: Low-Medium**  
Click-drag with the rectangle marquee/selection tool did not create a visible selection marquee on the canvas. The cursor changed as expected, but no selection rectangle appeared after the drag completed. The smart-select (sparkle) tool worked as an alternative.

> **Status:** The `SelectionOverlay` component was substantially rewritten in the subsequent session (added 8 resize handles, improved pointer event handling). Manual re-test recommended to confirm the basic drag-to-select flow works end-to-end.

### 5. Eraser Tool Not Clearly Accessible *(open)*
**Severity: Low**  
The `E` key did not activate an eraser tool. No eraser shortcut appears to be wired up, and the eraser tool icon in the toolbar was not clearly distinguishable. Manual erasing was not possible during the demo session.

> The eraser tool (`eraser.ts`) exists and is registered in the toolbox (▢ glyph), but keyboard shortcut binding is unconfirmed.

### 6. Screen Recording Required Browser-Based Workaround *(tooling — not a code bug)*
**Severity: Low (process only)**  
QuickTime screen recording could not be automated due to macOS `loginwindow` blocking programmatic control of the desktop when no app window was focused. The demo recording was captured as a browser-tab GIF instead. This is a tooling limitation, not an app bug, but worth noting for future demo automation.

---

## Changes Since Demo (commits 568eac7 → b1dbb12)

### Bug Fixes
Seven usability bugs were fixed in the session immediately following this demo:

| # | Bug | File | Fix |
|---|-----|------|-----|
| 1 | **Fill tool infinite loop + out-of-bounds crash** | `fill.ts` | Added `Uint8Array` visited bitset; coordinate clamping on edge pixels |
| 2 | **Canvas Size silent data loss** | `MenuBar.tsx` | Dirty-check + confirm guard (same as New Project) |
| 3 | **Smart-select off-by-one** | `smartSelect.ts` | `maxX − minX + 1` / `maxY − minY + 1` for correct selection dimensions |
| 4 | **Shape overlay ghost** | `shapes.ts` | Clear overlay at start of each new shape stroke |
| 5 | **CommandBar keyboard hint wrong** | `CommandBar.tsx` | Corrected to "↵ generate · ⇧+↵ new line" |
| 6 | **FloatingActions missing `maskBoundsPx`** | `FloatingActions.tsx` | All quick-action buttons now include `maskBoundsPx` in inpaint requests |
| 7 | **Window blur leaves drawing state active** | `CanvasStage.tsx` | `window blur` listener cancels in-progress stroke and clears overlay marks |

All 63 tests pass after these fixes.

### New Features
- **Selection resize handles** — 8 interactive handles (4 corners + 4 edge midpoints) on the selection overlay; uses global window listeners with a `cleanupRef` so they're torn down on unmount.
- **FloatingActions Re-run button** — recalls the last inpaint/restyle prompt from chat history and re-fires generation against the current (possibly resized) selection bounds.
- **Settings tab** — per-session overrides for provider, model, autonomy, default style, variation count, and feather radius; persisted in `localStorage` via a new `settingsStore`.
- **Generate queue** — server-side concurrency control (`GenerateQueue`: 1 active, 2 queued by default); new `GET /ai/status` endpoint surfaces queue depth without spawning a subprocess.
- **Worker-thread draw execution** — `runDrawCodeInWorker` runs Codex-written `draw()` functions in a `node:worker_threads` Worker (`drawCodeWorker.js`), preventing a hung draw from blocking the event loop.
- **Pointer tool** — new `pointer.ts` tool (↖ glyph) exits selection mode; added to the toolbox as the first entry, making the tool count 12.

---

## Overall Impressions

Painter AI has a clean, capable foundation. The `Cmd+K` generation loop, named AI layers, and the smart-select tool form a compelling core workflow. The app feels snappy during normal use.

The most pressing open issues are the **File > New freeze** (blocks new-session workflows) and the **silent mock-mode fallback** (makes it impossible to evaluate real AI quality without knowing about the auth requirement). Addressing those two would significantly improve first-run experience.

The UX around image generation discoverability (chat vs. Cmd+K) could also be smoothed out — new users will intuitively type in the chat box first.

---

*Report generated by automated demo session on 2026-05-24. Updated to reflect post-demo fixes on 2026-05-24.*
