import type { AIBackend, AIGenerateRequest, AIGenerateResult } from "../types";
import { codexClient, base64PngToImageBitmap } from "./client";
import { bitmapToBase64Png } from "./contextSerializer";

export const codexBackend: AIBackend = {
  async generate(req: AIGenerateRequest, onProgress) {
    onProgress(5);
    const sourcePngBase64 = await bitmapToBase64Png(req.source);
    onProgress(20);
    const maskPngBase64 = req.mask ? await bitmapToBase64Png(req.mask) : undefined;
    onProgress(35);

    const body = {
      prompt: req.prompt,
      width: req.dimensions.width,
      height: req.dimensions.height,
      mode: req.mode,
      style: req.style,
      variations: req.variations,
      seed: req.seed,
      sourcePngBase64,
      maskPngBase64,
    };
    onProgress(45);
    const res = await codexClient.generate(body);
    onProgress(85);
    const variations = await Promise.all(
      res.variationsBase64.map(async (b64, i) => ({
        image: await base64PngToImageBitmap(b64),
        seed: res.seeds[i] ?? Date.now() + i,
      })),
    );
    onProgress(100);
    return { variations } as AIGenerateResult;
  },
};
