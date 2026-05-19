import type { ToolHandler } from "./types";

let drawing = false;
let start: { x: number; y: number } | null = null;

export const selectTool: ToolHandler = {
  id: "select",
  cursor: "crosshair",
  onDown(ctx, p) {
    drawing = true;
    start = { x: p.x, y: p.y };
    ctx.setSelection(null);
    ctx.clearOverlay();
  },
  onMove(ctx, p) {
    if (!drawing || !start) return;
    ctx.clearOverlay();
    const o = ctx.overlay;
    o.save();
    o.strokeStyle = "#3257ff";
    o.lineWidth = 1.5;
    o.setLineDash([6, 4]);
    o.strokeRect(Math.min(start.x, p.x), Math.min(start.y, p.y), Math.abs(p.x - start.x), Math.abs(p.y - start.y));
    o.restore();
  },
  onUp(ctx, p) {
    if (!drawing || !start) return;
    drawing = false;
    const w = Math.abs(p.x - start.x);
    const h = Math.abs(p.y - start.y);
    // Dismiss only true clicks — threshold scaled to ~0.5% of canvas dim so it
    // works the same on a 512² or a 1536² project.
    const minDim = Math.max(4, Math.round(ctx.dimensions.width * 0.005));
    if (w < minDim && h < minDim) {
      ctx.clearOverlay();
      ctx.setSelection(null);
      start = null;
      return;
    }
    ctx.setSelection({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w,
      h,
    });
    start = null;
  },
};
