import type { EditorState, Layer, Selection } from "../../../state/editorStore";

export interface ToolPoint {
  x: number;
  y: number;
  pressure: number;
}

export interface ToolContext {
  layer: Layer;
  ctx: CanvasRenderingContext2D;
  overlay: CanvasRenderingContext2D;
  state: EditorState;
  dimensions: { width: number; height: number };
  // Mutators
  setStatus: (text: string) => void;
  commitStroke: (before: ImageData) => void; // call on pointerup to push history
  setSelection: (s: Selection | null) => void;
  clearOverlay: () => void;
  bumpRender: () => void;
}

export interface ToolHandler {
  id: string;
  cursor: string;
  onDown(ctx: ToolContext, p: ToolPoint): void;
  onMove(ctx: ToolContext, p: ToolPoint): void;
  onUp(ctx: ToolContext, p: ToolPoint): void;
}
