import type { Segmenter, SegmentRequest, SegmentResult } from "./types";
import { codexClient, base64PngToImageBitmap } from "./codex/client";
import { bitmapToBase64Png } from "./codex/contextSerializer";

export const serverSegmenter: Segmenter = {
  async segment(req: SegmentRequest): Promise<SegmentResult> {
    const sourcePngBase64 = await bitmapToBase64Png(req.source);
    const body = {
      sourcePngBase64,
      hint: req.hint,
    };
    const res = await codexClient.segment(body);
    const mask = await base64PngToImageBitmap(res.maskPngBase64);
    if (res.warning) {
      return { mask, warning: res.warning, hint: res.hint };
    }
    return { mask };
  },
};
