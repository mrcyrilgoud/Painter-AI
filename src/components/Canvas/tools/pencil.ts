import type { ToolHandler } from "./types";

let drawing = false;
let last: { x: number; y: number } | null = null;
let snap: ImageData | null = null;

export const pencilTool: ToolHandler = {
  id: "pencil",
  cursor: "crosshair",
  onDown(ctx, p) {
    drawing = true;
    snap = ctx.ctx.getImageData(0, 0, ctx.layer.canvas.width, ctx.layer.canvas.height);
    last = { x: p.x, y: p.y };
    const c = ctx.ctx;
    c.fillStyle = ctx.state.primaryColor;
    const size = Math.max(1, Math.round(ctx.state.brushSize * 0.4));
    c.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    ctx.bumpRender();
  },
  onMove(ctx, p) {
    if (!drawing || !last) return;
    const c = ctx.ctx;
    c.strokeStyle = ctx.state.primaryColor;
    c.lineWidth = Math.max(1, ctx.state.brushSize * 0.4);
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(last.x, last.y);
    c.lineTo(p.x, p.y);
    c.stroke();
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
