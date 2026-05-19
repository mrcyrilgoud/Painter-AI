import vm from "node:vm";
import { createCanvas, createImageData } from "canvas";
import type { CanvasRenderingContext2D } from "canvas";
import type { ImageGenRequest, ImageGenResult, ImageProvider } from "./types.js";

// Re-exported so tests can produce a canvas/ctx pair from the same module
// instance that runDrawCode uses (avoids cross-version mismatches).
export { createCanvas };

/** Hard wall-clock for executing a Codex-written draw() function. */
const DRAW_EXEC_TIMEOUT_MS = 5_000;

export const DRAW_SYSTEM = `You are a canvas artist. Write a JavaScript function that renders the requested scene onto an HTML5 Canvas 2D context.

Rules:
- Output ONLY a single function with this exact signature:
  function draw(ctx, width, height) { ... }
- Use only standard Canvas 2D API: fillRect, fillStyle, strokeStyle, beginPath, arc, moveTo, lineTo, bezierCurveTo, createLinearGradient, createRadialGradient, etc.
- Fill the entire canvas with a coherent background first.
- Represent the subject matter clearly and literally — a sunset should have orange/pink sky and horizon, a castle should have towers and walls, a forest should have trees, etc.
- Match the style hint: "oilpaint" = thick brushstrokes with save/restore, "watercolor" = low-alpha overlapping shapes, "anime" = bold flat fills with hard outlines, "sketch" = thin grey lines, "pixel" = sharp-edge rectangles on a grid.
- No external resources. No try/catch. No console.log. No comments.
- Output ONLY the raw function body — no markdown, no explanation, no code fences.
`;

/**
 * Execute a Codex-written `draw(ctx, width, height)` snippet inside a vm context
 * with a wall-clock timeout. Loose sandbox — standard JS globals are exposed so
 * Codex's draw code keeps working; the timeout exists to stop runaway loops, not
 * to defend against a malicious model. The threat model here is "Codex output is
 * trusted enough but may loop forever by accident."
 */
export function runDrawCode(
  code: string,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const context = vm.createContext({
    ctx,
    width,
    height,
    Math,
    Date,
    Array,
    Object,
    Number,
    String,
    Boolean,
    JSON,
    Uint8Array,
    Uint8ClampedArray,
    Float32Array,
    Float64Array,
    Int32Array,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
  });
  const script = new vm.Script(`${code}\ndraw(ctx, width, height);`, { filename: "draw.js" });
  try {
    script.runInContext(context, { timeout: DRAW_EXEC_TIMEOUT_MS });
  } catch (err) {
    const firstLine = code.split("\n")[0]?.slice(0, 120) ?? "";
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`draw() execution failed (${reason}); first line: ${firstLine}`);
  }
}

export function extractCode(raw: string): string {
  const fenced = raw.match(/```(?:javascript|js)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const fnMatch = raw.match(/function draw\s*\([\s\S]*/);
  if (fnMatch) return fnMatch[0].trim();
  return raw.trim();
}

/** Callback that takes a user prompt + system prompt and returns the raw model response text. */
export type GenerateText = (prompt: string, systemPrompt: string) => Promise<string>;

async function renderBase(
  generateText: GenerateText,
  prompt: string,
  style: string,
  width: number,
  height: number,
): Promise<{ pixels: Uint8ClampedArray; width: number; height: number }> {
  const styleHint = style && style !== "none" ? ` Style: ${style}.` : "";
  const raw = await generateText(
    `Scene: "${prompt}"${styleHint}\nCanvas: ${width}×${height}px`,
    DRAW_SYSTEM,
  );
  const code = extractCode(raw);
  const canvas = createCanvas(width, height);
  const ctx: CanvasRenderingContext2D = canvas.getContext("2d");
  runDrawCode(code, ctx, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  return { pixels: imageData.data, width, height };
}

function deriveVariation(
  base: { pixels: Uint8ClampedArray; width: number; height: number },
  rShift: number,
  gShift: number,
  bShift: number,
  brightnessScale: number,
): string {
  const { pixels, width, height } = base;
  const canvas = createCanvas(width, height);
  const ctx: CanvasRenderingContext2D = canvas.getContext("2d");
  const out = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    out[i]     = Math.min(255, Math.max(0, Math.round((pixels[i]     + rShift) * brightnessScale)));
    out[i + 1] = Math.min(255, Math.max(0, Math.round((pixels[i + 1] + gShift) * brightnessScale)));
    out[i + 2] = Math.min(255, Math.max(0, Math.round((pixels[i + 2] + bShift) * brightnessScale)));
    out[i + 3] = pixels[i + 3];
  }
  const id = createImageData(out, width, height);
  ctx.putImageData(id, 0, 0);
  return canvas.toBuffer("image/png").toString("base64");
}

const VARIATION_SHIFTS: Array<[number, number, number, number]> = [
  [0,   0,   0,   1.00],
  [10, -5,  -15,  0.93],
  [-8,  5,   18,  1.07],
  [15,  10, -10,  0.96],
];

export interface CanvasProviderOptions {
  isReady?: () => { ready: boolean; reason?: string };
}

export function makeCanvasProvider(
  name: string,
  generateText: GenerateText,
  options: CanvasProviderOptions = {},
): ImageProvider {
  return {
    name,
    isReady: options.isReady ?? (() => ({ ready: true })),
    async generate(req: ImageGenRequest): Promise<ImageGenResult> {
      const { prompt, style = "none", width, height, variations = 1 } = req;
      const count = Math.max(1, Math.min(variations, 4));
      const baseSeed = req.seed ?? Math.floor(Math.random() * 1_000_000);
      const base = await renderBase(generateText, prompt, style, width, height);
      const variationsBase64 = Array.from({ length: count }, (_, i) => {
        const [r, g, b, bright] = VARIATION_SHIFTS[i] ?? VARIATION_SHIFTS[0];
        return deriveVariation(base, r, g, b, bright);
      });
      const seeds = Array.from({ length: count }, (_, i) => baseSeed + i);
      return { variationsBase64, seeds };
    },
  };
}
