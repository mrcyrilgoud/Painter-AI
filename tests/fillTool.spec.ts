import { describe, it, expect } from "vitest";

// Build a minimal HTMLCanvasElement using jsdom (already available in the test env).
function makeCanvas(w: number, h: number, fillStyle = "#ffffff"): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = fillStyle;
  ctx.fillRect(0, 0, w, h);
  return c;
}

// Re-export the internals we need to test by importing the tool's onDown handler
// indirectly: paint a 4×4 white canvas, click at various coordinates, check result.
// We exercise the tool through the module's exported handler to keep the test
// aligned with production code paths.

// Because floodFill is not exported, we drive it through the tool handler's
// onDown(), mocking the minimal ToolContext the handler expects.
import { fillTool } from "../src/components/Canvas/tools/fill";
import type { ToolContext } from "../src/components/Canvas/tools/types";

function makeCtx(canvas: HTMLCanvasElement, color = "#ff0000"): ToolContext {
  return {
    layer: { canvas } as ToolContext["layer"],
    ctx: canvas.getContext("2d")!,
    overlay: {} as CanvasRenderingContext2D,
    state: { primaryColor: color, exitSelectionMode: () => {} } as ToolContext["state"],
    dimensions: { width: canvas.width, height: canvas.height },
    setStatus: () => {},
    commitStroke: () => {},
    setSelection: () => {},
    clearOverlay: () => {},
    bumpRender: () => {},
  };
}

describe("fillTool", () => {
  it("fills a solid white canvas with the primary colour", () => {
    const canvas = makeCanvas(4, 4, "#ffffff");
    const toolCtx = makeCtx(canvas, "#0000ff");
    fillTool.onDown(toolCtx, { x: 1, y: 1, pressure: 0.5 });
    const data = canvas.getContext("2d")!.getImageData(0, 0, 4, 4).data;
    // Every pixel should now be blue (#0000ff, alpha 255).
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBe(0);       // R
      expect(data[i + 1]).toBe(0);   // G
      expect(data[i + 2]).toBe(255); // B
    }
  });

  it("does not throw when the click coordinate is at the exact right edge", () => {
    // x = width after Math.round was the out-of-bounds crash path.
    const canvas = makeCanvas(8, 8, "#ffffff");
    const toolCtx = makeCtx(canvas, "#ff0000");
    // Exact right edge — Math.round(7.5) = 8 which equals width; must be clamped.
    expect(() =>
      fillTool.onDown(toolCtx, { x: 7.5, y: 0, pressure: 0.5 }),
    ).not.toThrow();
  });

  it("does not throw when the click coordinate is at the exact bottom edge", () => {
    const canvas = makeCanvas(8, 8, "#ffffff");
    const toolCtx = makeCtx(canvas, "#ff0000");
    expect(() =>
      fillTool.onDown(toolCtx, { x: 0, y: 7.5, pressure: 0.5 }),
    ).not.toThrow();
  });

  it("does not re-fill pixels already matching the fill colour", () => {
    // Canvas filled with red; flood-filling red with red should be a no-op.
    const canvas = makeCanvas(4, 4, "#ff0000");
    const toolCtx = makeCtx(canvas, "#ff0000");
    // Should return early without error.
    expect(() =>
      fillTool.onDown(toolCtx, { x: 2, y: 2, pressure: 0.5 }),
    ).not.toThrow();
    const data = canvas.getContext("2d")!.getImageData(0, 0, 4, 4).data;
    // All pixels still red.
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBe(255);
      expect(data[i + 1]).toBe(0);
      expect(data[i + 2]).toBe(0);
    }
  });
});
