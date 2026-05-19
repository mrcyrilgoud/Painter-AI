import type { Segmenter, SegmentRequest, SegmentResult } from "./types";

async function bitmapToImageData(bm: ImageBitmap): Promise<{ data: ImageData; canvas: HTMLCanvasElement }> {
  const c = document.createElement("canvas");
  c.width = bm.width;
  c.height = bm.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bm, 0, 0);
  return { data: ctx.getImageData(0, 0, c.width, c.height), canvas: c };
}

function maskCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function rectMask(w: number, h: number, x: number, y: number, ww: number, hh: number): HTMLCanvasElement {
  const c = maskCanvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, ww, hh);
  return c;
}

function floodMask(src: ImageData, x: number, y: number, tolerance = 24): HTMLCanvasElement {
  const { width, height, data } = src;
  const mask = maskCanvas(width, height);
  const mctx = mask.getContext("2d")!;
  const mImg = mctx.createImageData(width, height);
  const md = mImg.data;
  const sx = Math.max(0, Math.min(width - 1, Math.round(x)));
  const sy = Math.max(0, Math.min(height - 1, Math.round(y)));
  const startIdx = (sy * width + sx) * 4;
  const sr = data[startIdx],
    sg = data[startIdx + 1],
    sb = data[startIdx + 2];
  const stack: number[] = [sx, sy];
  const visited = new Uint8Array(width * height);
  while (stack.length > 0) {
    const py = stack.pop()!;
    const px = stack.pop()!;
    if (px < 0 || px >= width || py < 0 || py >= height) continue;
    const idx = py * width + px;
    if (visited[idx]) continue;
    visited[idx] = 1;
    const di = idx * 4;
    const dr = Math.abs(data[di] - sr);
    const dg = Math.abs(data[di + 1] - sg);
    const db = Math.abs(data[di + 2] - sb);
    if (dr + dg + db > tolerance * 3) continue;
    md[di] = 255;
    md[di + 1] = 255;
    md[di + 2] = 255;
    md[di + 3] = 255;
    stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
  }
  mctx.putImageData(mImg, 0, 0);
  return mask;
}

function colorWordMask(
  src: ImageData,
  prompt: string,
): { canvas: HTMLCanvasElement; matchedKnownColor: boolean } {
  // Very dumb mock: match obvious color words
  const target = ((): [number, number, number] | null => {
    const p = prompt.toLowerCase();
    if (p.includes("red")) return [200, 60, 60];
    if (p.includes("blue") || p.includes("sky")) return [120, 170, 220];
    if (p.includes("green") || p.includes("tree") || p.includes("grass")) return [80, 160, 90];
    if (p.includes("yellow") || p.includes("sun")) return [240, 220, 80];
    if (p.includes("white") || p.includes("cloud")) return [240, 240, 240];
    if (p.includes("brown") || p.includes("wood") || p.includes("cottage") || p.includes("house"))
      return [170, 110, 70];
    return null;
  })();
  const { width, height, data } = src;
  const mask = maskCanvas(width, height);
  const mctx = mask.getContext("2d")!;
  const mImg = mctx.createImageData(width, height);
  if (!target) {
    mctx.putImageData(mImg, 0, 0);
    return { canvas: mask, matchedKnownColor: false };
  }
  const md = mImg.data;
  const TOL = 70;
  for (let i = 0; i < data.length; i += 4) {
    if (
      Math.abs(data[i] - target[0]) +
        Math.abs(data[i + 1] - target[1]) +
        Math.abs(data[i + 2] - target[2]) <
      TOL * 3
    ) {
      md[i] = 255;
      md[i + 1] = 255;
      md[i + 2] = 255;
      md[i + 3] = 255;
    }
  }
  mctx.putImageData(mImg, 0, 0);
  return { canvas: mask, matchedKnownColor: true };
}

function canvasIsEmpty(c: HTMLCanvasElement): boolean {
  const ctx = c.getContext("2d")!;
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== 0) return false;
  }
  return true;
}

export const mockSegmenter: Segmenter = {
  async segment(req: SegmentRequest): Promise<SegmentResult> {
    const { data } = await bitmapToImageData(req.source);
    let mask: HTMLCanvasElement;
    let warning: "no_color_match" | "empty_mask" | undefined;
    switch (req.hint.kind) {
      case "point":
        mask = floodMask(data, req.hint.x, req.hint.y);
        if (canvasIsEmpty(mask)) warning = "empty_mask";
        break;
      case "box":
        mask = rectMask(data.width, data.height, req.hint.x, req.hint.y, req.hint.w, req.hint.h);
        break;
      case "text": {
        const result = colorWordMask(data, req.hint.prompt);
        mask = result.canvas;
        if (!result.matchedKnownColor) warning = "no_color_match";
        else if (canvasIsEmpty(mask)) warning = "empty_mask";
        break;
      }
    }
    const bitmap = await createImageBitmap(mask);
    return warning ? { mask: bitmap, warning } : { mask: bitmap };
  },
};
