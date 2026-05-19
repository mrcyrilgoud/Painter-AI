import type { CanvasContext } from "../types";

async function bitmapToBase64Png(bm: ImageBitmap): Promise<string> {
  const c = document.createElement("canvas");
  c.width = bm.width;
  c.height = bm.height;
  c.getContext("2d")!.drawImage(bm, 0, 0);
  const dataUrl = c.toDataURL("image/png");
  return dataUrl;
}

export interface SerializedChatContext {
  dimensions: { width: number; height: number };
  hasSelection: boolean;
  selectionBounds?: { x: number; y: number; w: number; h: number };
  layers: { id: string; name: string; visible: boolean; isAI: boolean }[];
  references: { role: string; weight: number }[];
  recentOps: { prompt: string; mode: string; style: string }[];
}

export function serializeChatContext(
  ctx: CanvasContext,
  selectionBounds?: { x: number; y: number; w: number; h: number },
): SerializedChatContext {
  return {
    dimensions: ctx.dimensions,
    hasSelection: !!ctx.selection,
    selectionBounds,
    layers: ctx.layers,
    references: ctx.references.map((r) => ({ role: r.role, weight: r.weight })),
    recentOps: ctx.recentOps.map((o) => ({ prompt: o.prompt, mode: o.mode, style: o.style })),
  };
}

export { bitmapToBase64Png };
