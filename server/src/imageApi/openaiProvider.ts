import { config } from "../config.js";
import type { ImageGenRequest, ImageGenResult, ImageProvider } from "./types.js";

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
  const raw = b64.replace(/^data:[^;]+;base64,/, "");
  const bytes = Uint8Array.from(Buffer.from(raw, "base64"));
  return new File([bytes], name, { type: "image/png" });
}

async function callGenerate(req: ImageGenRequest): Promise<string[]> {
  const size = pickModelSize(req.width, req.height);
  const body = {
    model: "gpt-image-1",
    prompt: req.prompt,
    n: Math.min(req.variations, 4),
    size,
    output_format: "png",
  };
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI generate ${res.status}: ${t.slice(0, 300)}`);
  }
  const j = (await res.json()) as { data: { b64_json: string }[] };
  return j.data.map((d) => d.b64_json);
}

async function callEdits(req: ImageGenRequest): Promise<string[]> {
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
  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { authorization: `Bearer ${config.openaiApiKey}` },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI edits ${res.status}: ${t.slice(0, 300)}`);
  }
  const j = (await res.json()) as { data: { b64_json: string }[] };
  return j.data.map((d) => d.b64_json);
}

export const openaiProvider: ImageProvider = {
  name: "openai-gpt-image-1",
  isReady() {
    if (!config.openaiApiKey) {
      return { ready: false, reason: "OPENAI_API_KEY not set" };
    }
    return { ready: true };
  },
  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    const isInpaint = req.mode === "inpaint" && !!req.maskPngBase64;
    const variationsBase64 = isInpaint ? await callEdits(req) : await callGenerate(req);
    const seeds = variationsBase64.map((_, i) => (req.seed ?? Date.now()) + i);
    return { variationsBase64, seeds };
  },
};
