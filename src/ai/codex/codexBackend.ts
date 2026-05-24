import type { AIBackend, AIGenerateRequest, AIGenerateResult } from "../types";
import { useSettingsStore } from "../../state/settingsStore";
import { codexClient, base64PngToImageBitmap } from "./client";
import { bitmapToBase64Png } from "./contextSerializer";

export const codexBackend: AIBackend = {
  async generate(req: AIGenerateRequest, onProgress, signal?: AbortSignal) {
    onProgress(5);
    const [sourcePngBase64, maskPngBase64] = await Promise.all([
      bitmapToBase64Png(req.source),
      req.mask ? bitmapToBase64Png(req.mask) : Promise.resolve(undefined),
    ]);
    signal?.throwIfAborted();
    onProgress(35);

    const { providerOverride, modelOverride } = useSettingsStore.getState();
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
      maskBoundsPx: req.maskBoundsPx,
      ...(providerOverride ? { providerOverride } : {}),
      ...(modelOverride ? { modelOverride } : {}),
    };
    onProgress(45);
    const res = await codexClient.generate(body, { signal });
    onProgress(85);

    const regionBounds =
      res.outputKind === "inpaint-region" && res.boundsPx ? res.boundsPx : undefined;

    const variations = await Promise.all(
      res.variationsBase64.map(async (b64, i) => ({
        image: await base64PngToImageBitmap(b64),
        seed: res.seeds[i] ?? Date.now() + i,
        regionBounds,
      })),
    );
    onProgress(100);
    return {
      variations,
      boundsPx: res.boundsPx,
      outputKind: res.outputKind,
    } as AIGenerateResult;
  },
};
