import type { ToolHandler } from "./types";

let drawing = false;
let last: { x: number; y: number } | null = null;
let snap: ImageData | null = null;

export const eraserTool: ToolHandler = {
  id: "eraser",
  cursor: "cell",
  onDown(ctx, p) {
    drawing = true;
    snap = ctx.ctx.getImageData(0, 0, ctx.layer.canvas.width, ctx.layer.canvas.height);
    last = { x: p.x, y: p.y };
    erase(ctx.ctx, p.x, p.y, ctx.state.brushSize);
    ctx.bumpRender();
  },
  onMove(ctx, p) {
    if (!drawing || !last) return;
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - last.x, p.y - last.y) / 2));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = last.x + (p.x - last.x) * t;
      const y = last.y + (p.y - last.y) * t;
      erase(ctx.ctx, x, y, ctx.state.brushSize);
    }
    last = { x: p.x, y: p.y };
    ctx.bumpRender();
  },
  onUp(ctx) {
    if (!drawing) return;
    drawing = false;
    last = null;
    if (snap) ctx.commitStroke(snap);
    snap = null;
  },
};

function erase(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.save();
  c.globalCompositeOperation = "destination-out";
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.restore();
}
