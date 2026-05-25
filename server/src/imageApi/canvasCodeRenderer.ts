import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
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
export const DRAW_EXEC_TIMEOUT_MS = 5_000;

function drawWorkerPath(): string {
  try {
    const url = new URL("./drawCodeWorker.js", import.meta.url);
    if (url.protocol === "file:") {
      return fileURLToPath(url);
    }
  } catch {
    // Vitest may provide a non-file import.meta.url — fall back below.
  }
  return path.join(process.cwd(), "server/src/imageApi/drawCodeWorker.js");
}

export const DRAW_SYSTEM = `Write a JavaScript function draw(ctx,width,height) for Canvas 2D. Max 40 lines, no comments. Draw back-to-front. Use gradients for backgrounds, sky, ground, or water as appropriate for the requested scene (e.g. use deep black/dark gradient with stars for space, realistic skies for outdoors). Use realistic colors and positioning for the scene. Objects should sit on the ground/floor line if ground-based, or float/be positioned naturally. Style hint if given. Output ONLY the raw function, no markdown.
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
- The "Surrounding context" block in the user message lists the dominant boundary palette and the average color of each edge of the fill region. Pick fills, backgrounds, and edge gradients that transition smoothly from those boundary/edge colors into your content so it blends seamlessly into the surrounding image.
- Render the subject matter the user requested, matching the lighting, colors, and perspective implied by the surrounding palette and global thumbnail.
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

/** Run draw() in a worker thread so VM execution cannot block the event loop. */
export async function runDrawCodeInWorker(
  code: string,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(drawWorkerPath(), {
      workerData: { code, width, height },
    });
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };

    const timeout = setTimeout(() => {
      worker.terminate();
      finish(() => reject(new Error("draw() timed out")));
    }, DRAW_EXEC_TIMEOUT_MS + 500);

    const onAbort = () => {
      worker.terminate();
      finish(() => reject(new Error("aborted")));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    worker.on("message", (msg: { pixels: Uint8ClampedArray } | { error: string }) => {
      finish(() => {
        if ("error" in msg) {
          const firstLine = code.split("\n")[0]?.slice(0, 120) ?? "";
          reject(new Error(`draw() execution failed (${msg.error}); first line: ${firstLine}`));
          return;
        }
        resolve(msg.pixels);
      });
    });
    worker.on("error", (err) => {
      finish(() => reject(err));
    });
    worker.on("exit", (exitCode) => {
      if (exitCode !== 0) {
        finish(() => reject(new Error(`draw() worker exited with code ${exitCode}`)));
      }
    });
  });
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
  baseSeed: number,
  options?: ImageProviderGenerateOptions,
): Promise<{ pixels: Uint8ClampedArray; width: number; height: number; modelMs: number; drawMs: number }> {
  const styleHint = style && style !== "none" ? ` Style: ${style}.` : "";
  const modelStart = Date.now();
  const raw = await generateText(
    `Scene: "${prompt}"${styleHint}\nCanvas: ${width}×${height}px\nSeed: ${baseSeed}`,
    DRAW_SYSTEM,
    options,
  );
  const modelMs = Date.now() - modelStart;
  const code = extractCode(raw);
  const drawStart = Date.now();
  const pixels = await runDrawCodeInWorker(code, width, height, options?.signal);
  const drawMs = Date.now() - drawStart;
  return { pixels, width, height, modelMs, drawMs };
}

export function validateInpaint(
  code: string,
  pixels: Uint8ClampedArray,
  prompt: string,
  _bounds: { w: number; h: number },
): { valid: boolean; reason?: string } {
  if (!code.includes("function draw")) {
    return { valid: false, reason: "Code does not contain the draw(ctx, width, height) function signature." };
  }

  const hasCtxCalls = /ctx\.\w+/.test(code);
  if (!hasCtxCalls) {
    return { valid: false, reason: "The code does not perform any drawing operations on the 'ctx' canvas context." };
  }

  if (pixels.length === 0) {
    return { valid: false, reason: "The generated pixel buffer is empty." };
  }

  let isBlankOrSolid = true;
  const firstR = pixels[0];
  const firstG = pixels[1];
  const firstB = pixels[2];
  const firstA = pixels[3];
  
  for (let i = 4; i < pixels.length; i += 4) {
    if (
      pixels[i] !== firstR ||
      pixels[i + 1] !== firstG ||
      pixels[i + 2] !== firstB ||
      pixels[i + 3] !== firstA
    ) {
      isBlankOrSolid = false;
      break;
    }
  }

  const isRemovePrompt = /remove|erase|delete|bg|background|clear|blend/i.test(prompt);

  if (isBlankOrSolid) {
    if (firstA === 0) {
      return { valid: false, reason: "The generated image is completely transparent (blank canvas)." };
    }
    if (!isRemovePrompt) {
      return { valid: false, reason: "The generated image is a flat, single solid color. For creative prompts, you must draw a rich, detailed subject that blends with the surroundings." };
    }
  }

  return { valid: true };
}

export function generateProceduralFallback(
  width: number,
  height: number,
  edgeColors: { top: string; right: string; bottom: string; left: string }
): Uint8ClampedArray {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  
  const gradV = ctx.createLinearGradient(0, 0, 0, height);
  gradV.addColorStop(0, edgeColors.top || "#ffffff");
  gradV.addColorStop(1, edgeColors.bottom || "#ffffff");
  ctx.fillStyle = gradV;
  ctx.fillRect(0, 0, width, height);

  const gradH = ctx.createLinearGradient(0, 0, width, 0);
  const leftColor = edgeColors.left || "#ffffff";
  const rightColor = edgeColors.right || "#ffffff";
  gradH.addColorStop(0, leftColor + "80");
  gradH.addColorStop(1, rightColor + "80");
  ctx.fillStyle = gradH;
  ctx.fillRect(0, 0, width, height);

  return ctx.getImageData(0, 0, width, height).data as unknown as Uint8ClampedArray;
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
  variationSeed: number,
  options?: ImageProviderGenerateOptions,
): Promise<{ pixels: Uint8ClampedArray; width: number; height: number; modelMs: number; drawMs: number }> {
  const styleHint = style && style !== "none" ? ` Style: ${style}.` : "";
  const edgeSeedNote = description.edgeRows
    ? "\nUse the Edge rows listed below to match your outer boundary gradients to the adjacent colors."
    : "";
  const baseUserPrompt =
    `Fill request: "${prompt}"${styleHint}${edgeSeedNote}\n` +
    `Seed: ${variationSeed}\n` +
    `Fill window: ${bounds.w}×${bounds.h}px (positioned at (${bounds.x},${bounds.y}) inside a ${fullWidth}×${fullHeight} image)\n` +
    `Surrounding context:\n${description.text}`;

  let currentPrompt = baseUserPrompt;
  let attempts = 0;
  const maxAttempts = 3;
  let lastError: string | null = null;
  let modelMsTotal = 0;
  let drawMsTotal = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const modelStart = Date.now();
    try {
      const raw = await generateText(currentPrompt, INPAINT_SYSTEM, options);
      modelMsTotal += Date.now() - modelStart;
      const code = extractCode(raw);

      const drawStart = Date.now();
      const pixels = await runDrawCodeInWorker(code, bounds.w, bounds.h, options?.signal);
      drawMsTotal += Date.now() - drawStart;

      const validation = validateInpaint(code, pixels, prompt, bounds);
      if (validation.valid) {
        return { pixels, width: bounds.w, height: bounds.h, modelMs: modelMsTotal, drawMs: drawMsTotal };
      } else {
        lastError = validation.reason || "Validation failed";
      }
    } catch (err) {
      modelMsTotal += Date.now() - modelStart;
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (options?.signal?.aborted) {
      throw new Error("aborted");
    }

    currentPrompt =
      baseUserPrompt +
      `\n\n---\n\n` +
      `CRITICAL: Your previous code output failed validation or execution.\n` +
      `Failure reason: ${lastError}\n` +
      `Please write a CORRECT JavaScript function draw(ctx, width, height) that resolves this error.\n` +
      `Ensure you draw rich visual details representing the prompt "${prompt}", blending perfectly with the surrounding palette and edge colors. Use actual drawing operations (ctx.fillRect, ctx.arc, etc.) and write ONLY the raw code for the draw() function without any markdown backticks or extra explanation.`;
  }

  // Fallback to procedurally generated premium gradient
  const fallbackStart = Date.now();
  const pixels = generateProceduralFallback(bounds.w, bounds.h, description.edgeColors);
  drawMsTotal += Date.now() - fallbackStart;

  return {
    pixels,
    width: bounds.w,
    height: bounds.h,
    modelMs: modelMsTotal,
    drawMs: drawMsTotal,
  };
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
          const rendered = await renderBase(generateText, prompt, style, width, height, baseSeed, generateOptions);
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
            baseSeed,
            generateOptions,
          );
          base = rendered;
          modelMs = rendered.modelMs;
          drawMs = rendered.drawMs;
        }
      } else {
        const rendered = await renderBase(generateText, prompt, style, width, height, baseSeed, generateOptions);
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
