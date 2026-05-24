import { PNG } from "pngjs";

/** Strip a `data:...;base64,` prefix if present. */
export function stripBase64DataUrl(b64: string): string {
  return b64.replace(/^data:[^;]+;base64,/, "");
}

/** Decode a base64-encoded PNG into width/height/RGBA buffer. */
export function decodeBase64Png(b64: string): { width: number; height: number; data: Buffer } {
  const png = PNG.sync.read(Buffer.from(stripBase64DataUrl(b64), "base64"));
  return { width: png.width, height: png.height, data: png.data };
}

export interface MaskBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Tight integer bounds of opaque (red > 128) pixels in an RGBA mask buffer.
 * Returns null when the mask is empty.
 */
export function maskBoundsFromPixels(
  data: ArrayLike<number>,
  width: number,
  height: number,
): MaskBounds | null {
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++) {
    const rowOff = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[rowOff + x * 4] > 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
