import { describe, it, expect, vi } from "vitest";
import { makeCanvasProvider } from "../server/src/imageApi/canvasCodeRenderer";

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const DRAW_RED = "function draw(ctx, w, h) { ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, w, h); }";

describe("canvas provider performance", () => {
  it("passes abort signals into text generation", async () => {
    const generateText = vi.fn(async (_prompt, _system, options) => {
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      return DRAW_RED;
    });
    const provider = makeCanvasProvider("test-canvas", generateText);
    const ctrl = new AbortController();

    await provider.generate(
      {
        prompt: "sky",
        width: 8,
        height: 8,
        mode: "newLayer",
        variations: 1,
      },
      { signal: ctrl.signal },
    );

    expect(generateText).toHaveBeenCalledOnce();
  });

  it("returns region-sized inpaint output when mask bounds are provided", async () => {
    const generateText = vi.fn(async () => DRAW_RED);
    const provider = makeCanvasProvider("test-canvas", generateText);

    const result = await provider.generate({
      prompt: "fill",
      width: 1,
      height: 1,
      mode: "inpaint",
      variations: 1,
      sourcePngBase64: PNG_1X1,
      maskPngBase64: PNG_1X1,
      maskBoundsPx: { x: 0, y: 0, w: 1, h: 1 },
    });

    expect(result.outputKind).toBe("inpaint-region");
    expect(result.boundsPx).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(result.variationsBase64).toHaveLength(1);
  });
});
