import { describe, it, expect } from "vitest";
import type { Segmenter } from "../../src/ai/types";

function makeSource(w: number, h: number): Promise<ImageBitmap> {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#7eaadc"; // blueish
  ctx.fillRect(0, 0, w, h / 2);
  ctx.fillStyle = "#50a05a"; // greenish
  ctx.fillRect(0, h / 2, w, h / 2);
  return createImageBitmap(c);
}

/**
 * Behavioural contract for any Segmenter. Mask dimensions must match the
 * source, and a text hint with no recognised colour word must surface
 * `warning: "no_color_match"` rather than silently returning an empty mask.
 */
export function segmenterContract(name: string, factory: () => Segmenter) {
  describe(`Segmenter contract: ${name}`, () => {
    it("returns a mask the same size as the source for a point hint", async () => {
      const segmenter = factory();
      const source = await makeSource(40, 40);
      const result = await segmenter.segment({
        source,
        hint: { kind: "point", x: 5, y: 5 },
      });
      expect(result.mask.width).toBe(40);
      expect(result.mask.height).toBe(40);
    });

    it("returns a mask the same size as the source for a box hint", async () => {
      const segmenter = factory();
      const source = await makeSource(40, 40);
      const result = await segmenter.segment({
        source,
        hint: { kind: "box", x: 10, y: 10, w: 15, h: 15 },
      });
      expect(result.mask.width).toBe(40);
      expect(result.mask.height).toBe(40);
      expect(result.warning).toBeUndefined();
    });

    it("flags `no_color_match` when the text prompt mentions no known colour", async () => {
      const segmenter = factory();
      const source = await makeSource(40, 40);
      const result = await segmenter.segment({
        source,
        hint: { kind: "text", prompt: "the chartreuse mongoose" },
      });
      expect(result.warning).toBe("no_color_match");
    });
  });
}
