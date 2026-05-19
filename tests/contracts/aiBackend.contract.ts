import { describe, it, expect } from "vitest";
import type { AIBackend, AIGenerateRequest } from "../../src/ai/types";

function makeBlankBitmap(w: number, h: number): Promise<ImageBitmap> {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  return createImageBitmap(c);
}

async function makeRequest(overrides: Partial<AIGenerateRequest> = {}): Promise<AIGenerateRequest> {
  const w = 32;
  const h = 32;
  return {
    mode: "newLayer",
    source: await makeBlankBitmap(w, h),
    prompt: "a small red square",
    style: "none",
    cfgScale: 7,
    steps: 10,
    variations: 2,
    dimensions: { width: w, height: h },
    seed: 1,
    ...overrides,
  };
}

/**
 * Behavioural contract for any AIBackend implementation. Any conforming
 * backend must satisfy these — Codex/Cursor/OpenAI variants should pass the
 * same spec when wired up.
 */
export function aiBackendContract(name: string, factory: () => AIBackend) {
  describe(`AIBackend contract: ${name}`, () => {
    it("returns the requested number of variations", async () => {
      const backend = factory();
      const req = await makeRequest({ variations: 3 });
      const result = await backend.generate(req, () => {});
      expect(result.variations).toHaveLength(3);
    });

    it("returns variations matching the requested dimensions", async () => {
      const backend = factory();
      const req = await makeRequest({ variations: 1 });
      const result = await backend.generate(req, () => {});
      expect(result.variations[0].image.width).toBe(req.dimensions.width);
      expect(result.variations[0].image.height).toBe(req.dimensions.height);
    });

    it("calls onProgress with values in [0, 100], finishing at 100", async () => {
      const backend = factory();
      const req = await makeRequest({ variations: 1 });
      const progress: number[] = [];
      await backend.generate(req, (p) => progress.push(p));
      expect(progress.length).toBeGreaterThan(0);
      expect(progress.every((p) => p >= 0 && p <= 100)).toBe(true);
      expect(progress.at(-1)).toBe(100);
    });

    it("returns one seed per variation", async () => {
      const backend = factory();
      const req = await makeRequest({ variations: 2 });
      const result = await backend.generate(req, () => {});
      expect(result.variations.map((v) => typeof v.seed === "number")).toEqual([true, true]);
    });
  });
}
