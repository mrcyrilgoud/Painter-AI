import type { ToolHandler } from "./types";

export const pointerTool: ToolHandler = {
  id: "pointer",
  cursor: "default",
  onDown(ctx) {
    if (ctx.state.selection) {
      ctx.state.exitSelectionMode();
    }
  },
  onMove() {},
  onUp() {},
};
