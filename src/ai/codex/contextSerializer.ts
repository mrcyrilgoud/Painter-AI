import type { CanvasContext } from "../types";

async function blobToBase64DataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

async function bitmapToBase64Png(bm: ImageBitmap): Promise<string> {
  // Prefer OffscreenCanvas.convertToBlob — runs PNG encode off the main
  // thread, which matters on 1536×1024 canvases where toDataURL can stall
  // for hundreds of ms. Falls back to the sync path if unavailable.
  if (typeof OffscreenCanvas !== "undefined") {
    try {
      const off = new OffscreenCanvas(bm.width, bm.height);
      const octx = off.getContext("2d");
      if (octx) {
        (octx as OffscreenCanvasRenderingContext2D).drawImage(bm, 0, 0);
        const blob = await off.convertToBlob({ type: "image/png" });
        return await blobToBase64DataUrl(blob);
      }
    } catch {
      // fall through to sync path
    }
  }
  const c = document.createElement("canvas");
  c.width = bm.width;
  c.height = bm.height;
  c.getContext("2d")!.drawImage(bm, 0, 0);
  return c.toDataURL("image/png");
}

export interface SerializedChatContext {
  dimensions: { width: number; height: number };
  hasSelection: boolean;
  selectionBounds?: { x: number; y: number; w: number; h: number };
  layers: { id: string; name: string; visible: boolean; isAI: boolean }[];
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
    recentOps: ctx.recentOps,
  };
}

export { bitmapToBase64Png };
