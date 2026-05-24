import { describe, it, expect } from "vitest";
import { floodMask } from "../server/src/routes/segment";

function makeUniformImage(w: number, h: number, rgb: [number, number, number]) {
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const j = i * 4;
    data[j] = rgb[0];
    data[j + 1] = rgb[1];
    data[j + 2] = rgb[2];
    data[j + 3] = 255;
  }
  return { width: w, height: h, data };
}

describe("floodMask", () => {
  it("fills a uniform 256×256 image", () => {
    const src = makeUniformImage(256, 256, [100, 150, 200]);
    const mask = floodMask(src, 128, 128, 24);
    expect(mask.every((v) => v === 1)).toBe(true);
  });

  it("respects color tolerance boundaries", () => {
    const src = makeUniformImage(32, 32, [100, 100, 100]);
    // Paint a different-colored corner
    src.data[0] = 255;
    src.data[1] = 0;
    src.data[2] = 0;
    const mask = floodMask(src, 16, 16, 5);
    expect(mask[0]).toBe(0);
    expect(mask[16 * 32 + 16]).toBe(1);
  });
});
