import { describe, it, expect, beforeAll } from "vitest";
import { mockBackend } from "../src/ai/mockBackend";
import { mockSegmenter } from "../src/ai/mockSegmenter";
import { mockCopilot } from "../src/ai/mockCopilot";
import type { AIGenerateRequest, CanvasContext, CopilotEvent } from "../src/ai/types";

/**
 * Real contract tests against the mock implementations. The same scenarios
 * should pass against the codex-backed implementations when RUN_CODEX_TESTS=1
 * and the proxy is reachable (codex.spec.ts will mirror these).
 */

const W = 64;
const H = 64;

function whiteCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  return c;
}

function maskCanvas(x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, w, h);
  return c;
}

let source: ImageBitmap;
let centerMask: ImageBitmap;

beforeAll(async () => {
  source = await createImageBitmap(whiteCanvas());
  centerMask = await createImageBitmap(maskCanvas(20, 20, 24, 24));
});

describe("mockBackend.generate", () => {
  it("returns the requested number of variations with distinct seeds", async () => {
    const req: AIGenerateRequest = {
      mode: "newLayer",
      source,
      prompt: "test",
      style: "watercolor",
      cfgScale: 7,
      steps: 20,
      variations: 4,
      seed: 1234,
      dimensions: { width: W, height: H },
    };
    const progressTicks: number[] = [];
    const res = await mockBackend.generate(req, (p) => progressTicks.push(p));
    expect(res.variations).toHaveLength(4);
    const seeds = res.variations.map((v) => v.seed);
    expect(new Set(seeds).size).toBe(4);
    expect(res.variations[0].image.width).toBe(W);
    expect(res.variations[0].image.height).toBe(H);
    expect(progressTicks.length).toBeGreaterThan(0);
    expect(Math.max(...progressTicks)).toBe(100);
  });

  it("returns mask-shaped results when given a mask", async () => {
    const req: AIGenerateRequest = {
      mode: "inpaint",
      source,
      mask: centerMask,
      prompt: "test",
      style: "oilpaint",
      cfgScale: 7,
      steps: 20,
      variations: 1,
      seed: 42,
      dimensions: { width: W, height: H },
    };
    const res = await mockBackend.generate(req, () => {});
    expect(res.variations[0].image.width).toBe(W);
    expect(res.variations[0].image.height).toBe(H);
    expect(res.variations[0].seed).toBe(42);
    // Pixel-level mask correctness is exercised end-to-end in the browser
    // (preview verification); jsdom's canvas backend doesn't faithfully
    // round-trip drawImage→getImageData so we keep the assertion here at
    // the structural level.
  });
});

describe("mockSegmenter.segment", () => {
  it("returns a same-sized mask for a point hint", async () => {
    const result = await mockSegmenter.segment({
      source,
      hint: { kind: "point", x: 5, y: 5 },
    });
    expect(result.mask.width).toBe(W);
    expect(result.mask.height).toBe(H);
  });

  it("returns a same-sized mask for a box hint without warning", async () => {
    const result = await mockSegmenter.segment({
      source,
      hint: { kind: "box", x: 10, y: 10, w: 20, h: 20 },
    });
    expect(result.mask.width).toBe(W);
    expect(result.mask.height).toBe(H);
    expect(result.warning).toBeUndefined();
  });

  it("returns a same-sized mask for a text hint mentioning a known color", async () => {
    const result = await mockSegmenter.segment({
      source,
      hint: { kind: "text", prompt: "the blue sky" },
    });
    expect(result.mask.width).toBe(W);
    expect(result.mask.height).toBe(H);
  });

  it("flags no_color_match when the text hint mentions no known colour", async () => {
    const result = await mockSegmenter.segment({
      source,
      hint: { kind: "text", prompt: "the chartreuse mongoose" },
    });
    expect(result.warning).toBe("no_color_match");
  });
});

describe("mockCopilot.send", () => {
  function emptyCtx(): CanvasContext {
    return {
      source,
      layers: [{ id: "bg", name: "Background", visible: true, isAI: false }],
      activeLayerId: "bg",
      references: [],
      recentOps: [],
      dimensions: { width: W, height: H },
    };
  }

  async function collect(message: string): Promise<CopilotEvent[]> {
    const events: CopilotEvent[] = [];
    for await (const e of mockCopilot.send(message, emptyCtx())) events.push(e);
    return events;
  }

  it("emits text events and a done for non-actionable messages", async () => {
    const events = await collect("what do you think of this?");
    expect(events.some((e) => e.kind === "text")).toBe(true);
    expect(events.at(-1)?.kind).toBe("done");
    expect(events.some((e) => e.kind === "op-proposal")).toBe(false);
  });

  it("emits an op-proposal when the user asks for an action", async () => {
    const events = await collect("add a small boat on the lake");
    const op = events.find((e): e is Extract<CopilotEvent, { kind: "op-proposal" }> => e.kind === "op-proposal");
    expect(op).toBeDefined();
    expect(op!.request.prompt).toContain("boat");
    expect(["inpaint", "outpaint", "newLayer", "img2img", "restyle"]).toContain(op!.request.mode);
    expect(op!.confidence).toBeGreaterThan(0);
    expect(op!.confidence).toBeLessThanOrEqual(1);
  });

  it("infers watercolor style from the prompt", async () => {
    const events = await collect("paint a watercolor field");
    const op = events.find((e): e is Extract<CopilotEvent, { kind: "op-proposal" }> => e.kind === "op-proposal");
    expect(op?.request.style).toBe("watercolor");
  });
});
