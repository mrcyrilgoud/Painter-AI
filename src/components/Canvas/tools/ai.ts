import { useUIStore } from "../../../state/uiStore";
import type { ToolHandler } from "./types";

/**
 * AI brush: clicking the canvas anchors a small selection (default 64×64,
 * clamped to canvas bounds) centred on the click point and opens the Command
 * Bar, ready for an inpaint prompt. Acts as a quick "what should I do here?"
 * entry point that skips the rectangle-drag step of the regular select tool.
 */
const DEFAULT_BOX = 64;

export const aiBrushTool: ToolHandler = {
  id: "ai",
  cursor: "crosshair",
  onDown(toolCtx, p) {
    const { dimensions, setSelection } = toolCtx;
    const half = DEFAULT_BOX / 2;
    const x = Math.max(0, Math.min(dimensions.width - DEFAULT_BOX, p.x - half));
    const y = Math.max(0, Math.min(dimensions.height - DEFAULT_BOX, p.y - half));
    setSelection({ x, y, w: DEFAULT_BOX, h: DEFAULT_BOX });
    useUIStore.getState().openCommandBar();
  },
  onMove() {},
  onUp() {},
};
