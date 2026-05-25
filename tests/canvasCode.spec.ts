import { describe, it, expect } from "vitest";
import {
  createCanvas,
  runDrawCode,
  runDrawCodeInWorker,
  extractCode,
  validateInpaint,
  generateProceduralFallback,
} from "../server/src/imageApi/canvasCodeRenderer";

describe("canvasCodeRenderer", () => {
  describe("extractCode", () => {
    it("strips ```javascript fences", () => {
      const raw = "```javascript\nfunction draw(ctx, w, h) { ctx.fillRect(0,0,w,h); }\n```";
      expect(extractCode(raw)).toContain("function draw");
      expect(extractCode(raw)).not.toContain("```");
    });

    it("returns raw input when no fence is present", () => {
      const raw = "function draw(ctx, w, h) {}";
      expect(extractCode(raw)).toBe(raw);
    });
  });

  describe("runDrawCode", () => {
    it("executes a valid draw function and paints the canvas", () => {
      const canvas = createCanvas(8, 8);
      const ctx = canvas.getContext("2d");
      const code = `function draw(ctx, w, h) { ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, w, h); }`;
      runDrawCode(code, ctx, 8, 8);
      const data = ctx.getImageData(0, 0, 1, 1).data;
      expect(data[0]).toBe(255);
      expect(data[1]).toBe(0);
      expect(data[2]).toBe(0);
    });

    it("aborts an infinite loop within the timeout and throws", () => {
      const canvas = createCanvas(8, 8);
      const ctx = canvas.getContext("2d");
      const code = `function draw(ctx, w, h) { while (true) {} }`;
      const t0 = Date.now();
      expect(() => runDrawCode(code, ctx, 8, 8)).toThrow(/draw\(\) execution failed/);
      const elapsed = Date.now() - t0;
      // 5s default timeout + a little slack for vm overhead
      expect(elapsed).toBeLessThan(7_000);
      expect(elapsed).toBeGreaterThanOrEqual(4_500);
    }, 10_000);

    it("surfaces a draw() runtime error with the first source line", () => {
      const canvas = createCanvas(8, 8);
      const ctx = canvas.getContext("2d");
      const code = `function draw(ctx, w, h) { ctx.nonexistentMethod(); }`;
      expect(() => runDrawCode(code, ctx, 8, 8)).toThrow(/first line:.*function draw/);
    });
  });

  describe("runDrawCodeInWorker", () => {
    it("executes a valid draw function off the main thread", async () => {
      const code = `function draw(ctx, w, h) { ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, w, h); }`;
      const pixels = await runDrawCodeInWorker(code, 8, 8);
      expect(pixels[0]).toBe(0);
      expect(pixels[1]).toBe(255);
      expect(pixels[2]).toBe(0);
    });

    it("aborts an infinite loop within the timeout", async () => {
      const code = `function draw(ctx, w, h) { while (true) {} }`;
      const t0 = Date.now();
      await expect(runDrawCodeInWorker(code, 8, 8)).rejects.toThrow(/draw\(\) execution failed|timed out/);
      expect(Date.now() - t0).toBeLessThan(7_000);
    }, 10_000);

    it("honours abort signal", async () => {
      const code = `function draw(ctx, w, h) { while (true) {} }`;
      const ctrl = new AbortController();
      const p = runDrawCodeInWorker(code, 8, 8, ctrl.signal);
      ctrl.abort();
      await expect(p).rejects.toThrow(/aborted/);
    });
  });

  describe("validateInpaint", () => {
    it("fails when draw function signature is missing", () => {
      const res = validateInpaint("const x = 5;", new Uint8ClampedArray([0,0,0,0]), "add birds", { w: 1, h: 1 });
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("signature");
    });

    it("fails when no ctx operations are performed", () => {
      const res = validateInpaint("function draw(ctx, w, h) { return 42; }", new Uint8ClampedArray([0,0,0,0]), "add birds", { w: 1, h: 1 });
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("drawing operations");
    });

    it("fails on fully transparent / empty pixels", () => {
      const res = validateInpaint(
        "function draw(ctx, w, h) { ctx.fillRect(0,0,w,h); }",
        new Uint8ClampedArray([0,0,0,0, 0,0,0,0]),
        "add birds",
        { w: 2, h: 1 }
      );
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("transparent");
    });

    it("fails on flat solid color for creative prompts", () => {
      const res = validateInpaint(
        "function draw(ctx, w, h) { ctx.fillStyle = '#ff0000'; ctx.fillRect(0,0,w,h); }",
        new Uint8ClampedArray([255,0,0,255, 255,0,0,255]),
        "add birds",
        { w: 2, h: 1 }
      );
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("solid color");
    });

    it("passes on flat solid color for remove prompts", () => {
      const res = validateInpaint(
        "function draw(ctx, w, h) { ctx.fillStyle = '#ff0000'; ctx.fillRect(0,0,w,h); }",
        new Uint8ClampedArray([255,0,0,255, 255,0,0,255]),
        "seamless background remove",
        { w: 2, h: 1 }
      );
      expect(res.valid).toBe(true);
    });

    it("passes on rich multi-color drawing for creative prompts", () => {
      const res = validateInpaint(
        "function draw(ctx, w, h) { ctx.fillRect(0,0,w,h); }",
        new Uint8ClampedArray([255,0,0,255, 0,255,0,255]),
        "add a colorful ball",
        { w: 2, h: 1 }
      );
      expect(res.valid).toBe(true);
    });
  });

  describe("generateProceduralFallback", () => {
    it("draws a smooth blending gradient matching the edge colors", () => {
      const edgeColors = {
        top: "#ff0000",     // Red
        bottom: "#00ff00",  // Green
        left: "#0000ff",    // Blue
        right: "#ffff00",   // Yellow
      };
      const pixels = generateProceduralFallback(8, 8, edgeColors);
      expect(pixels).toHaveLength(8 * 8 * 4);
      // Verify corner/edge values have been painted
      expect(pixels[0]).toBeGreaterThan(0); // Top-left should have red/blue components
      expect(pixels[3]).toBe(255); // Alpha channel is fully opaque
    });
  });
});
