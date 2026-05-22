import type { ToolHandler } from "./types";

interface ShapeState {
  drawing: boolean;
  start: { x: number; y: number } | null;
  snap: ImageData | null;
}

function init(): ShapeState {
  return { drawing: false, start: null, snap: null };
}

function strokeStyle(ctx: CanvasRenderingContext2D, color: string, size: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.6);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function previewRect(o: CanvasRenderingContext2D, color: string, size: number) {
  o.setLineDash([6, 4]);
  strokeStyle(o, color, size);
}

export function makeShapeTool(
  id: "line" | "rect" | "ellipse",
  draw: (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) => void,
): ToolHandler {
  const s = init();
  return {
    id,
    cursor: "crosshair",
    onDown(ctx, p) {
      s.drawing = true;
      s.start = { x: p.x, y: p.y };
      s.snap = ctx.ctx.getImageData(0, 0, ctx.layer.canvas.width, ctx.layer.canvas.height);
      ctx.clearOverlay();
    },
    onMove(ctx, p) {
      if (!s.drawing || !s.start) return;
      ctx.clearOverlay();
      const o = ctx.overlay;
      previewRect(o, ctx.state.primaryColor, ctx.state.brushSize);
      draw(o, s.start.x, s.start.y, p.x, p.y);
      o.setLineDash([]);
    },
    onUp(ctx, p) {
      if (!s.drawing || !s.start) return;
      s.drawing = false;
      ctx.clearOverlay();
      strokeStyle(ctx.ctx, ctx.state.primaryColor, ctx.state.brushSize);
      draw(ctx.ctx, s.start.x, s.start.y, p.x, p.y);
      if (s.snap) ctx.commitStroke(s.snap);
      s.snap = null;
      s.start = null;
      ctx.bumpRender();
    },
  };
}

export const lineTool = makeShapeTool("line", (c, x0, y0, x1, y1) => {
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
});

export const rectTool = makeShapeTool("rect", (c, x0, y0, x1, y1) => {
  c.beginPath();
  c.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  c.stroke();
});

export const ellipseTool = makeShapeTool("ellipse", (c, x0, y0, x1, y1) => {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = Math.abs(x1 - x0) / 2;
  const ry = Math.abs(y1 - y0) / 2;
  c.beginPath();
  c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  c.stroke();
});
