import type { Layer } from "../state/editorStore";

export function compositeLayers(
  layers: Layer[],
  dimensions: { width: number; height: number },
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = dimensions.width;
  out.height = dimensions.height;
  const ctx = out.getContext("2d")!;
  // Fill white to ensure flattened bg
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  for (const l of layers) {
    if (!l.visible) continue;
    ctx.globalAlpha = l.opacity;
    ctx.globalCompositeOperation = l.blendMode;
    ctx.drawImage(l.canvas, 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  return out;
}

export async function compositeBitmap(
  layers: Layer[],
  dimensions: { width: number; height: number },
): Promise<ImageBitmap> {
  return createImageBitmap(compositeLayers(layers, dimensions));
}

export async function selectionToMask(
  selection: { x: number; y: number; w: number; h: number } | null,
  dimensions: { width: number; height: number },
): Promise<ImageBitmap | undefined> {
  if (!selection) return undefined;
  const c = document.createElement("canvas");
  c.width = dimensions.width;
  c.height = dimensions.height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(selection.x, selection.y, selection.w, selection.h);
  return createImageBitmap(c);
}
