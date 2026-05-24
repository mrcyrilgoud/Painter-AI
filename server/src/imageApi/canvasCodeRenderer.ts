import vm from "node:vm";
import { createCanvas, createImageData, loadImage } from "canvas";
import type { Canvas, CanvasRenderingContext2D } from "canvas";
import type {
  ImageGenRequest,
  ImageGenResult,
  ImageProvider,
  ImageProviderGenerateOptions,
} from "./types.js";
import { describeContext, type ContextDescription } from "./contextDescriber.js";
import { stripBase64DataUrl } from "./pngUtils.js";
import { logInfo } from "../log.js";

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
 * Inpaint variant — used when filling a region inside a larger image. The model
 * is told that its canvas is just the rectangular fill window, and is given a
 * structured description of the surrounding palette and edges so it can blend
 * in even without seeing the image directly.
 */
export const INPAINT_SYSTEM = `You are filling a rectangular region inside a larger image. Write a JavaScript function that paints ONLY the fill region.

Rules:
- Output ONLY a single function with this exact signature:
  function draw(ctx, width, height) { ... }
- The canvas you receive is JUST the fill region; (0,0) is the top-left of that region and (width,height) is its bottom-right. Do not draw a full scene around it.
- Use only standard Canvas 2D API: fillRect, fillStyle, strokeStyle, beginPath, arc, moveTo, lineTo, bezierCurveTo, createLinearGradient, createRadialGradient, etc.
- The "Surrounding context" block in the user message lists the dominant boundary palette and the average color of each edge of the fill region. Pick fills and edge gradients that continue those colors smoothly so the patch blends into the surrounding image.
- IMPORTANT — edge anchoring: The "Edge rows" block lists the actual pixel colors from the rows immediately outside each edge of your canvas. Your draw() MUST begin by painting a 2-pixel-wide strip along each edge using those exact colors. For the top edge, paint rows y=0 and y=1 using row-0 and row-1 hex values respectively, sampling evenly across the width. Do the same for bottom (y=height-1, y=height-2), left (x=0, x=1), and right (x=width-1, x=width-2). These seed pixels anchor your fill to the surrounding image — blend all content inward from them using gradients.
- Render the subject matter the user requested, but constrained to the colors and lighting implied by the surrounding palette.
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
export type GenerateText = (
  prompt: string,
  systemPrompt: string,
  options?: ImageProviderGenerateOptions,
) => Promise<string>;

async function renderBase(
  generateText: GenerateText,
  prompt: string,
  style: string,
  width: number,
  height: number,
  options?: ImageProviderGenerateOptions,
): Promise<{ pixels: Uint8ClampedArray; width: number; height: number; modelMs: number; drawMs: number }> {
  const styleHint = style && style !== "none" ? ` Style: ${style}.` : "";
  const modelStart = Date.now();
  const raw = await generateText(
    `Scene: "${prompt}"${styleHint}\nCanvas: ${width}×${height}px`,
    DRAW_SYSTEM,
    options,
  );
  const modelMs = Date.now() - modelStart;
  const code = extractCode(raw);
  const canvas = createCanvas(width, height);
  const ctx: CanvasRenderingContext2D = canvas.getContext("2d");
  const drawStart = Date.now();
  runDrawCode(code, ctx, width, height);
  const drawMs = Date.now() - drawStart;
  const imageData = ctx.getImageData(0, 0, width, height);
  return { pixels: imageData.data, width, height, modelMs, drawMs };
}

/**
 * Inpaint render — generates a region-sized canvas using the INPAINT_SYSTEM
 * prompt augmented with a structured description of the surrounding image.
 */
async function renderInpaint(
  generateText: GenerateText,
  prompt: string,
  style: string,
  fullWidth: number,
  fullHeight: number,
  bounds: { x: number; y: number; w: number; h: number },
  description: ContextDescription,
  options?: ImageProviderGenerateOptions,
): Promise<{ pixels: Uint8ClampedArray; width: number; height: number; modelMs: number; drawMs: number }> {
  const styleHint = style && style !== "none" ? ` Style: ${style}.` : "";
  const edgeSeedNote = description.edgeRows
    ? "\nFirst action in draw(): seed all four edge strips from the Edge rows below, then blend inward."
    : "";
  const userPrompt =
    `Fill request: "${prompt}"${styleHint}${edgeSeedNote}\n` +
    `Fill window: ${bounds.w}×${bounds.h}px (positioned at (${bounds.x},${bounds.y}) inside a ${fullWidth}×${fullHeight} image)\n` +
    `Surrounding context:\n${description.text}`;
  const modelStart = Date.now();
  const raw = await generateText(userPrompt, INPAINT_SYSTEM, options);
  const modelMs = Date.now() - modelStart;
  const code = extractCode(raw);

  const regionCanvas = createCanvas(bounds.w, bounds.h);
  const regionCtx: CanvasRenderingContext2D = regionCanvas.getContext("2d");
  const drawStart = Date.now();
  runDrawCode(code, regionCtx, bounds.w, bounds.h);
  const drawMs = Date.now() - drawStart;

  const imageData = regionCtx.getImageData(0, 0, bounds.w, bounds.h);
  return { pixels: imageData.data, width: bounds.w, height: bounds.h, modelMs, drawMs };
}

/**
 * Compute mask bounds from a base64 mask PNG by scanning the red channel.
 * Used as a fallback when the client did not send `maskBoundsPx`.
 */
async function boundsFromMask(
  maskPngBase64: string,
  width: number,
  height: number,
): Promise<{ x: number; y: number; w: number; h: number } | null> {
  const buf = Buffer.from(stripBase64DataUrl(maskPngBase64), "base64");
  const img = await loadImage(buf);
  const canvas = createCanvas(width, height);
  const ctx: CanvasRenderingContext2D = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] > 128) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || maxY < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Encode a canvas as a base64 PNG on the libuv thread pool, so the main event
 * loop isn't blocked while libpng compresses. Multiple parallel calls fan out
 * across worker threads, which is the headline win over sync `toBuffer`.
 */
function encodeCanvasPngBase64(canvas: Canvas): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBuffer((err, buf) => {
      if (err) reject(err);
      else resolve(buf.toString("base64"));
    }, "image/png");
  });
}

async function deriveVariation(
  base: { pixels: Uint8ClampedArray; width: number; height: number },
  rShift: number,
  gShift: number,
  bShift: number,
  brightnessScale: number,
): Promise<string> {
  const { pixels, width, height } = base;
  const canvas = createCanvas(width, height);
  const ctx: CanvasRenderingContext2D = canvas.getContext("2d");
  const isIdentity =
    rShift === 0 && gShift === 0 && bShift === 0 && brightnessScale === 1;
  let out: Uint8ClampedArray;
  if (isIdentity) {
    // Skip the per-pixel transform — putImageData copies internally anyway.
    out = pixels;
  } else {
    out = new Uint8ClampedArray(pixels.length);
    for (let i = 0; i < pixels.length; i += 4) {
      out[i]     = Math.min(255, Math.max(0, Math.round((pixels[i]     + rShift) * brightnessScale)));
      out[i + 1] = Math.min(255, Math.max(0, Math.round((pixels[i + 1] + gShift) * brightnessScale)));
      out[i + 2] = Math.min(255, Math.max(0, Math.round((pixels[i + 2] + bShift) * brightnessScale)));
      out[i + 3] = pixels[i + 3];
    }
  }
  const id = createImageData(out, width, height);
  ctx.putImageData(id, 0, 0);
  return encodeCanvasPngBase64(canvas);
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
    async generate(
      req: ImageGenRequest,
      generateOptions?: ImageProviderGenerateOptions,
    ): Promise<ImageGenResult> {
      const t0 = Date.now();
      const metrics: Record<string, unknown> = {
        provider: name,
        mode: req.mode,
      };

      const { prompt, style = "none", width, height, variations = 1 } = req;
      const count = Math.max(1, Math.min(variations, 4));
      const baseSeed = req.seed ?? Math.floor(Math.random() * 1_000_000);

      const isInpaint =
        req.mode === "inpaint" && !!req.sourcePngBase64 && !!req.maskPngBase64;
      let base: { pixels: Uint8ClampedArray; width: number; height: number };
      let inpaintBounds: { x: number; y: number; w: number; h: number } | undefined;
      let modelMs = 0;
      let drawMs = 0;

      if (isInpaint) {
        let bounds = req.maskBoundsPx;
        if (!bounds) {
          const boundsStart = Date.now();
          bounds = (await boundsFromMask(req.maskPngBase64!, width, height)) ?? undefined;
          metrics.boundsFromMaskMs = Date.now() - boundsStart;
        }

        if (!bounds || bounds.w < 1 || bounds.h < 1) {
          const rendered = await renderBase(generateText, prompt, style, width, height, generateOptions);
          base = rendered;
          modelMs = rendered.modelMs;
          drawMs = rendered.drawMs;
        } else {
          inpaintBounds = bounds;
          const describeStart = Date.now();
          const description = await describeContext(
            req.sourcePngBase64!,
            bounds,
            width,
            height,
          );
          metrics.describeContextMs = Date.now() - describeStart;
          const rendered = await renderInpaint(
            generateText,
            prompt,
            style,
            width,
            height,
            bounds,
            description,
            generateOptions,
          );
          base = rendered;
          modelMs = rendered.modelMs;
          drawMs = rendered.drawMs;
        }
      } else {
        const rendered = await renderBase(generateText, prompt, style, width, height, generateOptions);
        base = rendered;
        modelMs = rendered.modelMs;
        drawMs = rendered.drawMs;
      }

      metrics.modelMs = modelMs;
      metrics.drawMs = drawMs;

      const encodeStart = Date.now();
      // PNG encoding runs on libuv worker threads; fan out so N variations
      // encode in parallel instead of serializing on the main thread.
      const variationsBase64 = await Promise.all(
        Array.from({ length: count }, (_, i) => {
          const [r, g, b, bright] = VARIATION_SHIFTS[i] ?? VARIATION_SHIFTS[0];
          return deriveVariation(base, r, g, b, bright);
        }),
      );
      metrics.encodeMs = Date.now() - encodeStart;
      metrics.ms = Date.now() - t0;
      metrics.outputBytes = variationsBase64.reduce((sum, b64) => sum + b64.length, 0);

      logInfo(name, "canvas-provider", "perf", metrics);

      const seeds = Array.from({ length: count }, (_, i) => baseSeed + i);
      if (inpaintBounds) {
        return {
          variationsBase64,
          seeds,
          boundsPx: inpaintBounds,
          outputKind: "inpaint-region",
        };
      }
      return { variationsBase64, seeds, outputKind: "full-canvas" };
    },
  };
}
