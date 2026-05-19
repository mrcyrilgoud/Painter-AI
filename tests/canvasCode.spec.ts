import { describe, it, expect } from "vitest";
import {
  createCanvas,
  runDrawCode,
  extractCode,
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
});
