import type { ToolHandler } from "./types";

export const fillTool: ToolHandler = {
  id: "fill",
  cursor: "crosshair",
  onDown(ctx, p) {
    const before = ctx.ctx.getImageData(0, 0, ctx.layer.canvas.width, ctx.layer.canvas.height);
    const changed = floodFill(ctx.layer.canvas, Math.round(p.x), Math.round(p.y), ctx.state.primaryColor);
    if (changed) {
      ctx.commitStroke(before);
      ctx.bumpRender();
    }
    ctx.state.exitSelectionMode();
  },
  onMove() {},
  onUp() {},
};

function hexToRgba(hex: string): [number, number, number, number] {
  const v = hex.replace("#", "");
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return [r, g, b, 255];
}

function floodFill(canvas: HTMLCanvasElement, x: number, y: number, fillColor: string): boolean {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  // Clamp to valid pixel coords — Math.round on a click at the exact right/bottom
  // edge yields `width` or `height`, which is out-of-bounds for the pixel array.
  x = Math.max(0, Math.min(width - 1, x));
  y = Math.max(0, Math.min(height - 1, y));
  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;
  const startIdx = (y * width + x) * 4;
  // Hoist start/target channels to locals — avoids array-index loads inside the
  // hot loop and lets the JIT keep them in registers.
  const sr = data[startIdx];
  const sg = data[startIdx + 1];
  const sb = data[startIdx + 2];
  const sa = data[startIdx + 3];
  const [tr, tg, tb, ta] = hexToRgba(fillColor);
  if (sr === tr && sg === tg && sb === tb && sa === ta) return false;

  // tolerance = 1 (matches old behavior) — inlined as |a-b| <= 1.
  // visited prevents re-queueing pixels and eliminates an infinite-loop that
  // would occur when the fill colour differs from the source by exactly ±1 in
  // any channel (both match the ≤1 tolerance check, causing the pixel to be
  // pushed again after it has already been filled).
  const visited = new Uint8Array(width * height);
  const startFlat = y * width + x;
  visited[startFlat] = 1;
  const stack: number[] = [startFlat];
  while (stack.length > 0) {
    const idx = stack.pop()!;
    const px = idx % width;
    const py = (idx - px) / width;
    const i = idx * 4;
    const dr = data[i] - sr;
    const dg = data[i + 1] - sg;
    const db = data[i + 2] - sb;
    const da = data[i + 3] - sa;
    if (
      dr > 1 || dr < -1 ||
      dg > 1 || dg < -1 ||
      db > 1 || db < -1 ||
      da > 1 || da < -1
    )
      continue;
    data[i] = tr;
    data[i + 1] = tg;
    data[i + 2] = tb;
    data[i + 3] = ta;
    if (px + 1 < width && !visited[idx + 1]) { visited[idx + 1] = 1; stack.push(idx + 1); }
    if (px > 0 && !visited[idx - 1]) { visited[idx - 1] = 1; stack.push(idx - 1); }
    if (py + 1 < height && !visited[idx + width]) { visited[idx + width] = 1; stack.push(idx + width); }
    if (py > 0 && !visited[idx - width]) { visited[idx - width] = 1; stack.push(idx - width); }
  }
  ctx.putImageData(img, 0, 0);
  return true;
}
