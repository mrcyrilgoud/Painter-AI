import type { Selection } from "../state/editorStore";

/**
 * Tight rect around `selection` expanded by `pad` and clamped to canvas. The
 * compositing pipeline below only touches pixels inside this rect, so all
 * intermediate canvases are sized to it rather than the full image — keeping
 * GPU↔CPU transfers and GC churn proportional to the edit area, not the
 * canvas.
 */
function boundedRect(
  selection: Selection,
  target: { width: number; height: number },
  pad: number,
): { x: number; y: number; w: number; h: number } {
  const x0 = Math.max(0, Math.floor(selection.x - pad));
  const y0 = Math.max(0, Math.floor(selection.y - pad));
  const x1 = Math.min(target.width, Math.ceil(selection.x + selection.w + pad));
  const y1 = Math.min(target.height, Math.ceil(selection.y + selection.h + pad));
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/**
 * Copy a subrect from a full-image ImageData into a new ImageData without an
 * extra getImageData call. Avoids a second GPU→CPU round-trip.
 */
export function sliceImageData(
  full: ImageData,
  imgW: number,
  rect: { x: number; y: number; w: number; h: number },
): ImageData {
  const out = new ImageData(rect.w, rect.h);
  for (let row = 0; row < rect.h; row++) {
    const srcOff = ((rect.y + row) * imgW + rect.x) * 4;
    const dstOff = row * rect.w * 4;
    out.data.set(full.data.subarray(srcOff, srcOff + rect.w * 4), dstOff);
  }
  return out;
}

/**
 * Build a feathered mask sized to `rect` — white-filled selection-shaped area
 * with a `featherPx` blur falloff. Coordinates are local to `rect` (selection
 * position is offset by -rect.x/-rect.y).
 */
export function buildFeatherMask(
  selection: Selection,
  rect: { x: number; y: number; w: number; h: number },
  featherPx: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = rect.w;
  c.height = rect.h;
  const ctx = c.getContext("2d")!;
  const f = Math.max(0, Math.min(64, featherPx | 0));
  const lx = selection.x - rect.x;
  const ly = selection.y - rect.y;
  if (f === 0) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(lx, ly, selection.w, selection.h);
    return c;
  }
  ctx.filter = `blur(${f}px)`;
  ctx.fillStyle = "#ffffff";
  const inset = Math.min(Math.ceil(f / 2), Math.floor(Math.min(selection.w, selection.h) / 6));
  ctx.fillRect(
    lx + inset,
    ly + inset,
    Math.max(0, selection.w - inset * 2),
    Math.max(0, selection.h - inset * 2),
  );
  ctx.filter = "none";
  return c;
}

/**
 * Seam-heal pass — re-composite the boundary pixels of the original (before)
 * image back over the result through a ring-shaped alpha mask, smoothing any
 * color discontinuity feathering alone can't remove. All work happens inside
 * the bounded rect.
 */
export function applyEdgeRing(
  target: HTMLCanvasElement,
  beforeBounded: ImageData,
  selection: Selection,
  rect: { x: number; y: number; w: number; h: number },
  seamWidth: number,
): void {
  const sw = Math.max(1, Math.min(seamWidth, Math.floor(Math.min(selection.w, selection.h) / 4)));
  const lx = selection.x - rect.x;
  const ly = selection.y - rect.y;

  // Ring mask in bounded space: white selection rect with a blurred
  // transparent inner punch, leaving an opaque ring at the edge that fades in.
  const ring = document.createElement("canvas");
  ring.width = rect.w;
  ring.height = rect.h;
  const rctx = ring.getContext("2d")!;
  rctx.fillStyle = "#ffffff";
  rctx.fillRect(lx, ly, selection.w, selection.h);
  rctx.globalCompositeOperation = "destination-out";
  rctx.filter = `blur(${sw}px)`;
  rctx.fillRect(lx + sw, ly + sw, Math.max(0, selection.w - sw * 2), Math.max(0, selection.h - sw * 2));
  rctx.filter = "none";
  rctx.globalCompositeOperation = "source-over";

  // Bounded "before" pixels.
  const beforeCanvas = document.createElement("canvas");
  beforeCanvas.width = rect.w;
  beforeCanvas.height = rect.h;
  beforeCanvas.getContext("2d")!.putImageData(beforeBounded, 0, 0);

  // Mask "before" through the ring (source-in).
  const maskedBefore = document.createElement("canvas");
  maskedBefore.width = rect.w;
  maskedBefore.height = rect.h;
  const mbctx = maskedBefore.getContext("2d")!;
  mbctx.drawImage(ring, 0, 0);
  mbctx.globalCompositeOperation = "source-in";
  mbctx.drawImage(beforeCanvas, 0, 0);

  // Composite onto the (full-size) target at the bounded offset.
  target.getContext("2d")!.drawImage(maskedBefore, rect.x, rect.y);
}

/**
 * Paste an AI variation into `target` through a feathered selection mask.
 * Returns before/after ImageData snapshots so callers can push the change
 * into the editor history.
 *
 * When `variationOffset` is set, `variation` is treated as a region-sized
 * bitmap positioned at `(variationOffset.x, .y)` in target-canvas space.
 * Otherwise `variation` is treated as full-canvas (drawn from `(0,0)`).
 *
 * Intermediate canvases are sized to a bounded rect around the selection
 * (expanded by `featherPx + seamWidth`), not the full image. Undo snapshots
 * cover only the dirty rect; history stores the offset for partial restore.
 */
export function pasteInfill(
  target: HTMLCanvasElement,
  variation: ImageBitmap,
  selection: Selection,
  featherPx: number,
  variationOffset?: { x: number; y: number },
): { before: ImageData; after: ImageData; dirtyRect: DOMRect } {
  const tctx = target.getContext("2d")!;
  const seamWidth = Math.max(1, Math.ceil(featherPx / 2));
  const pad = Math.max(0, featherPx) + seamWidth + 2;
  const rect = boundedRect(selection, target, pad);

  const before = tctx.getImageData(rect.x, rect.y, rect.w, rect.h);

  const mask = buildFeatherMask(selection, rect, featherPx);

  const vOff = variationOffset ?? { x: 0, y: 0 };
  const masked = document.createElement("canvas");
  masked.width = rect.w;
  masked.height = rect.h;
  const mctx = masked.getContext("2d")!;
  mctx.drawImage(mask, 0, 0);
  mctx.globalCompositeOperation = "source-in";
  mctx.drawImage(variation, vOff.x - rect.x, vOff.y - rect.y);
  mctx.globalCompositeOperation = "source-over";

  tctx.save();
  tctx.globalCompositeOperation = "destination-out";
  tctx.drawImage(mask, rect.x, rect.y);
  tctx.globalCompositeOperation = "source-over";
  tctx.drawImage(masked, rect.x, rect.y);
  tctx.restore();

  applyEdgeRing(target, before, selection, rect, seamWidth);

  const after = tctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  return { before, after, dirtyRect: new DOMRect(rect.x, rect.y, rect.w, rect.h) };
}
