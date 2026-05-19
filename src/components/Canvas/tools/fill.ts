import type { ToolHandler } from "./types";

export const fillTool: ToolHandler = {
  id: "fill",
  cursor: "crosshair",
  onDown(ctx, p) {
    const before = ctx.ctx.getImageData(0, 0, ctx.layer.canvas.width, ctx.layer.canvas.height);
    floodFill(ctx.layer.canvas, Math.round(p.x), Math.round(p.y), ctx.state.primaryColor);
    ctx.commitStroke(before);
    ctx.bumpRender();
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

function colorAt(d: Uint8ClampedArray, i: number) {
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
}

function colorsEqual(a: number[], b: number[], tol = 1) {
  return (
    Math.abs(a[0] - b[0]) <= tol &&
    Math.abs(a[1] - b[1]) <= tol &&
    Math.abs(a[2] - b[2]) <= tol &&
    Math.abs(a[3] - b[3]) <= tol
  );
}

function floodFill(canvas: HTMLCanvasElement, x: number, y: number, fillColor: string) {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;
  const startIdx = (y * width + x) * 4;
  const start = colorAt(data, startIdx);
  const target = hexToRgba(fillColor);
  if (colorsEqual(start, target, 0)) return;

  const stack: number[] = [x, y];
  while (stack.length > 0) {
    const py = stack.pop()!;
    const px = stack.pop()!;
    if (px < 0 || px >= width || py < 0 || py >= height) continue;
    const i = (py * width + px) * 4;
    if (!colorsEqual(colorAt(data, i), start)) continue;
    data[i] = target[0];
    data[i + 1] = target[1];
    data[i + 2] = target[2];
    data[i + 3] = target[3];
    stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
  }
  ctx.putImageData(img, 0, 0);
}
