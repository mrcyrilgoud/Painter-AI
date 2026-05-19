import type { ToolHandler } from "./types";

/**
 * Minimal text tool: clicking the canvas prompts for a string, then rasters it
 * onto the active layer at the click point using the primary colour and a
 * font size derived from the current brush size. Commits a history snapshot
 * so undo/redo works.
 *
 * The brushSize-to-font-size mapping (clamp 12–96 px) gives reasonable defaults
 * without exposing a separate font-size control.
 */
export const textTool: ToolHandler = {
  id: "text",
  cursor: "text",
  onDown(toolCtx, p) {
    const text = window.prompt("Text to place on the canvas:");
    if (!text || !text.trim()) return;

    const { ctx, layer, state } = toolCtx;
    const before = ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);

    const fontSize = Math.min(96, Math.max(12, state.brushSize * 6));
    ctx.fillStyle = state.primaryColor;
    ctx.font = `${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, p.x, p.y);

    toolCtx.commitStroke(before);
    toolCtx.bumpRender();
  },
  onMove() {},
  onUp() {},
};
