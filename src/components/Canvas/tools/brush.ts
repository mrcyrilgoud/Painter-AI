import type { ToolHandler } from "./types";

let drawing = false;
let last: { x: number; y: number } | null = null;
let snap: ImageData | null = null;

export const brushTool: ToolHandler = {
  id: "brush",
  cursor: "crosshair",
  onDown(ctx, p) {
    drawing = true;
    snap = ctx.ctx.getImageData(0, 0, ctx.layer.canvas.width, ctx.layer.canvas.height);
    last = { x: p.x, y: p.y };
    const c = ctx.ctx;
    c.fillStyle = ctx.state.primaryColor;
    const r = ctx.state.brushSize;
    c.beginPath();
    c.arc(p.x, p.y, r, 0, Math.PI * 2);
    c.fill();
    ctx.bumpRender();
  },
  onMove(ctx, p) {
    if (!drawing || !last) return;
    const c = ctx.ctx;
    c.strokeStyle = ctx.state.primaryColor;
    c.lineWidth = ctx.state.brushSize * 2;
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
