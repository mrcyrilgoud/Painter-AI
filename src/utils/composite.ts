import type { Layer, Selection } from "../state/editorStore";
import type { AIGenerateRequest } from "../ai/types";

export function compositeLayers(
  layers: Layer[],
  dimensions: { width: number; height: number },
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = dimensions.width;
  out.height = dimensions.height;
  const ctx = out.getContext("2d")!;
  // Fill white to ensure flattened bg
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  for (const l of layers) {
    if (!l.visible) continue;
    ctx.globalAlpha = l.opacity;
    ctx.globalCompositeOperation = l.blendMode;
    ctx.drawImage(l.canvas, 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  return out;
}

export async function compositeBitmap(
  layers: Layer[],
  dimensions: { width: number; height: number },
): Promise<ImageBitmap> {
  return createImageBitmap(compositeLayers(layers, dimensions));
}

/**
 * Tight integer pixel bounds that fully enclose a possibly fractional selection
 * rect. Uses floor for origin and ceil on the far edge so partial pixels at
 * sel.x + sel.w are included.
 */
export function selectionToMaskBoundsPx(
  selection: { x: number; y: number; w: number; h: number },
  dimensions?: { width: number; height: number },
): { x: number; y: number; w: number; h: number } {
  const x = Math.max(0, Math.floor(selection.x));
  const y = Math.max(0, Math.floor(selection.y));
  let x1 = Math.ceil(selection.x + selection.w);
  let y1 = Math.ceil(selection.y + selection.h);
  if (dimensions) {
    x1 = Math.min(dimensions.width, x1);
    y1 = Math.min(dimensions.height, y1);
  }
  return {
    x,
    y,
    w: Math.max(1, x1 - x),
    h: Math.max(1, y1 - y),
  };
}

export async function selectionToMask(
  selection: { x: number; y: number; w: number; h: number } | null,
  dimensions: { width: number; height: number },
): Promise<ImageBitmap | undefined> {
  if (!selection) return undefined;
  const c = document.createElement("canvas");
  c.width = dimensions.width;
  c.height = dimensions.height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(selection.x, selection.y, selection.w, selection.h);
  return createImageBitmap(c);
}

/**
 * Scan a full-canvas mask bitmap (white = fill) for its tight integer bounds.
 */
export function maskBitmapToBoundsPx(
  mask: ImageBitmap,
  dimensions: { width: number; height: number },
): Selection | null {
  const c = document.createElement("canvas");
  c.width = dimensions.width;
  c.height = dimensions.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(mask, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const W = dimensions.width;
  const H = dimensions.height;
  let minX = W,
    minY = H,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < H; y++) {
    const rowOff = y * W * 4;
    for (let x = 0; x < W; x++) {
      if (data.data[rowOff + x * 4] > 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || maxY < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Selection rect to use when committing an inpaint op — always from the
 * captured request, never the live editor selection.
 */
export function inpaintCommitSelectionFromRequest(
  request: AIGenerateRequest,
): Selection | null {
  if (request.maskBoundsPx) return request.maskBoundsPx;
  if (request.mask) return maskBitmapToBoundsPx(request.mask, request.dimensions);
  return null;
}
