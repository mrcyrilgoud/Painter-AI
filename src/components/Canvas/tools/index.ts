import type { ToolId } from "../../../state/editorStore";
import type { ToolHandler } from "./types";
import { pointerTool } from "./pointer";
import { pencilTool } from "./pencil";
import { brushTool } from "./brush";
import { eraserTool } from "./eraser";
import { fillTool } from "./fill";
import { lineTool, rectTool, ellipseTool } from "./shapes";
import { selectTool } from "./select";
import { smartSelectTool } from "./smartSelect";
import { textTool } from "./text";
import { aiBrushTool } from "./ai";

const noop: ToolHandler = {
  id: "noop",
  cursor: "default",
  onDown() {},
  onMove() {},
  onUp() {},
};

const handlers: Record<ToolId, ToolHandler> = {
  pointer: pointerTool,
  pencil: pencilTool,
  brush: brushTool,
  eraser: eraserTool,
  fill: fillTool,
  line: lineTool,
  rect: rectTool,
  ellipse: ellipseTool,
  select: selectTool,
  "smart-select": smartSelectTool,
  text: textTool,
  ai: aiBrushTool,
};

export function getToolHandler(tool: ToolId): ToolHandler {
  return handlers[tool] ?? noop;
}
