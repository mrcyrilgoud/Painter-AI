import { config } from "../config.js";
import { createCanvas, loadImage } from "canvas";
import type {
  ImageGenRequest,
  ImageGenResult,
  ImageProvider,
  ImageProviderGenerateOptions,
} from "./types.js";
import { logInfo } from "../log.js";
import { stripBase64DataUrl } from "./pngUtils.js";

/**
 * OpenAI gpt-image-1 provider. Calls the Images API:
 *   - POST /v1/images/generations for newLayer/restyle/img2img/outpaint without a mask
 *   - POST /v1/images/edits for inpainting (image + mask provided)
 *
 * Returns full-canvas-sized base64 PNGs. The model's native sizes are
 * 1024x1024, 1024x1536, 1536x1024 — we pick the closest preset.
 */
function pickModelSize(w: number, h: number): "1024x1024" | "1024x1536" | "1536x1024" {
  const ar = w / h;
  if (ar > 1.2) return "1536x1024";
  if (ar < 0.85) return "1024x1536";
  return "1024x1024";
}

async function fileFromBase64(b64: string, name: string): Promise<File> {
  const bytes = Uint8Array.from(Buffer.from(stripBase64DataUrl(b64), "base64"));
  return new File([bytes], name, { type: "image/png" });
}

async function callGenerate(
  req: ImageGenRequest,
  options?: ImageProviderGenerateOptions,
): Promise<string[]> {
  const size = pickModelSize(req.width, req.height);
  const body = {
    model: "gpt-image-1",
    prompt: req.prompt,
    n: Math.min(req.variations, 4),
    size,
    output_format: "png",
    ...(req.seed !== undefined ? { seed: req.seed } : {}),
  };
  const apiStart = Date.now();
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify(body),
    signal: options?.signal,
  });
  const apiMs = Date.now() - apiStart;
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI generate ${res.status}: ${t.slice(0, 300)}`);
  }
  const decodeStart = Date.now();
  const j = (await res.json()) as { data: { b64_json: string }[] };
  const decodeMs = Date.now() - decodeStart;
  logInfo("openai", "openai-provider", "perf", {
    mode: req.mode,
    apiMs,
    decodeMs,
    variationCount: j.data.length,
  });
  return j.data.map((d) => d.b64_json);
}

async function callEdits(
  req: ImageGenRequest,
  options?: ImageProviderGenerateOptions,
): Promise<string[]> {
  if (!req.sourcePngBase64 || !req.maskPngBase64) {
    throw new Error("inpaint requires both source and mask");
  }
  const size = pickModelSize(req.width, req.height);
  const form = new FormData();
  form.append("model", "gpt-image-1");
  form.append("image", await fileFromBase64(req.sourcePngBase64, "source.png"));
  form.append("mask", await fileFromBase64(req.maskPngBase64, "mask.png"));
  form.append("prompt", req.prompt);
  form.append("n", String(Math.min(req.variations, 4)));
  form.append("size", size);
  if (req.seed !== undefined) form.append("seed", String(req.seed));
  const apiStart = Date.now();
  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { authorization: `Bearer ${config.openaiApiKey}` },
    body: form,
    signal: options?.signal,
  });
  const apiMs = Date.now() - apiStart;
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI edits ${res.status}: ${t.slice(0, 300)}`);
  }
  const decodeStart = Date.now();
  const j = (await res.json()) as { data: { b64_json: string }[] };
  const decodeMs = Date.now() - decodeStart;
  logInfo("openai", "openai-provider", "perf", {
    mode: req.mode,
    apiMs,
    decodeMs,
    variationCount: j.data.length,
    inputBytes: {
      source: req.sourcePngBase64.length,
      mask: req.maskPngBase64.length,
    },
  });
  return j.data.map((d) => d.b64_json);
}

async function cropToBounds(
  b64: string,
  bounds: { x: number; y: number; w: number; h: number },
): Promise<string> {
  const img = await loadImage(Buffer.from(stripBase64DataUrl(b64), "base64"));
  const c = createCanvas(bounds.w, bounds.h);
  c.getContext("2d").drawImage(
    img,
    bounds.x,
    bounds.y,
    bounds.w,
    bounds.h,
    0,
    0,
    bounds.w,
    bounds.h,
  );
  return c.toBuffer("image/png").toString("base64");
}

export const openaiProvider: ImageProvider = {
  name: "openai-gpt-image-1",
  isReady() {
    if (!config.openaiApiKey) {
      return { ready: false, reason: "OPENAI_API_KEY not set" };
    }
    return { ready: true };
  },
  async generate(
    req: ImageGenRequest,
    options?: ImageProviderGenerateOptions,
  ): Promise<ImageGenResult> {
    const isInpaint = req.mode === "inpaint" && !!req.maskPngBase64;
    let variationsBase64 = isInpaint
      ? await callEdits(req, options)
      : await callGenerate(req, options);
    const seeds = variationsBase64.map((_, i) => (req.seed ?? Date.now()) + i);

    if (isInpaint && req.maskBoundsPx) {
      variationsBase64 = await Promise.all(
        variationsBase64.map((b64) => cropToBounds(b64, req.maskBoundsPx!)),
      );
      return {
        variationsBase64,
        seeds,
        outputKind: "inpaint-region",
        boundsPx: req.maskBoundsPx,
      };
    }
    return { variationsBase64, seeds, outputKind: "full-canvas" };
  },
};
