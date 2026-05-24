import { PNG } from "pngjs";
import type { ImageGenRequest, ImageGenResult, ImageProvider, ImageProviderGenerateOptions } from "./types.js";
import { decodeBase64Png, maskBoundsFromPixels } from "./pngUtils.js";

const STYLE_PALETTES: Record<string, [number, number, number][]> = {
  none: [[160, 192, 224], [224, 192, 160], [192, 224, 160], [224, 160, 192]],
  oilpaint: [[192, 57, 43], [230, 126, 34], [241, 196, 15], [142, 68, 173]],
  anime: [[106, 180, 245], [245, 160, 200], [255, 255, 255], [200, 160, 245]],
  sketch: [[68, 68, 68], [136, 136, 136], [204, 204, 204], [34, 34, 34]],
  watercolor: [[160, 216, 239], [176, 224, 230], [135, 206, 235], [95, 158, 160]],
  pixel: [[112, 192, 96], [240, 224, 48], [224, 64, 64], [64, 112, 240]],
};

function seededRandom(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function decodePngSafe(b64: string): { width: number; height: number; data: Buffer } | null {
  try {
    return decodeBase64Png(b64);
  } catch {
    return null;
  }
}

function encodePng(width: number, height: number, data: Buffer): string {
  const png = new PNG({ width, height });
  data.copy(png.data);
  return PNG.sync.write(png).toString("base64");
}

interface MaskBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

function paintVariation(
  width: number,
  height: number,
  palette: [number, number, number][],
  seed: number,
  source: { data: Buffer } | null,
  mask: { data: Buffer } | null,
  bbox: MaskBounds,
): Buffer {
  const rand = seededRandom(seed);
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < out.length; i += 4) {
    if (source) {
      out[i] = source.data[i];
      out[i + 1] = source.data[i + 1];
      out[i + 2] = source.data[i + 2];
      out[i + 3] = source.data[i + 3];
    } else {
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      out[i + 3] = 255;
    }
  }
  const { x: x0, y: y0, w, h } = bbox;
  const splotches = 220 + Math.floor(rand() * 120);
  for (let s = 0; s < splotches; s++) {
    const cx = x0 + rand() * w;
    const cy = y0 + rand() * h;
    const r = 6 + rand() * 28;
    const [pr, pg, pb] = palette[Math.floor(rand() * palette.length)];
    const alpha = 0.25 + rand() * 0.5;
    const r2 = r * r;
    const minPx = Math.max(0, Math.floor(cx - r));
    const maxPx = Math.min(width - 1, Math.ceil(cx + r));
    const minPy = Math.max(0, Math.floor(cy - r));
    const maxPy = Math.min(height - 1, Math.ceil(cy + r));
    for (let py = minPy; py <= maxPy; py++) {
      for (let px = minPx; px <= maxPx; px++) {
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy > r2) continue;
        // Respect mask
        if (mask && mask.data[(py * width + px) * 4] < 128) continue;
        const idx = (py * width + px) * 4;
        out[idx] = Math.round(out[idx] * (1 - alpha) + pr * alpha);
        out[idx + 1] = Math.round(out[idx + 1] * (1 - alpha) + pg * alpha);
        out[idx + 2] = Math.round(out[idx + 2] * (1 - alpha) + pb * alpha);
        out[idx + 3] = 255;
      }
    }
  }
  return out;
}

export const mockProvider: ImageProvider = {
  name: "mock",
  isReady() {
    return { ready: true };
  },
  async generate(
    req: ImageGenRequest,
    _options?: ImageProviderGenerateOptions,
  ): Promise<ImageGenResult> {
    const palette = STYLE_PALETTES[req.style ?? "none"] ?? STYLE_PALETTES.none;
    const baseSeed = req.seed ?? Math.floor(Math.random() * 1_000_000);
    const source = req.sourcePngBase64 ? decodePngSafe(req.sourcePngBase64) : null;
    const mask = req.maskPngBase64 ? decodePngSafe(req.maskPngBase64) : null;
    const bbox =
      (mask && maskBoundsFromPixels(mask.data, req.width, req.height)) ?? {
        x: 0,
        y: 0,
        w: req.width,
        h: req.height,
      };
    const variationsBase64: string[] = [];
    const seeds: number[] = [];
    const count = Math.max(1, Math.min(req.variations, 8));
    for (let i = 0; i < count; i++) {
      const seed = baseSeed + i * 7919;
      const buf = paintVariation(req.width, req.height, palette, seed, source, mask, bbox);
      variationsBase64.push(encodePng(req.width, req.height, buf));
      seeds.push(seed);
    }
    return { variationsBase64, seeds, outputKind: "full-canvas" };
  },
};
