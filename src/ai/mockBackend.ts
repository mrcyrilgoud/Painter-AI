import type { AIBackend, AIGenerateRequest, AIVariation } from "./types";
import { getStyle } from "./styles";

function seededRandom(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

async function bitmapToCanvas(bm: ImageBitmap): Promise<HTMLCanvasElement> {
  const c = document.createElement("canvas");
  c.width = bm.width;
  c.height = bm.height;
  c.getContext("2d")!.drawImage(bm, 0, 0);
  return c;
}

async function generateVariation(
  req: AIGenerateRequest,
  seed: number,
): Promise<AIVariation> {
  const { dimensions, source, mask } = req;
  const rand = seededRandom(seed);
  const style = getStyle(req.style);
  const palette = style.palette.slice();

  // Mix in reference colors as bias if requested
  if (req.references?.length) {
    for (const r of req.references) {
      if (r.role !== "color" && r.role !== "style") continue;
      const refCanvas = await bitmapToCanvas(r.image);
      const ctx = refCanvas.getContext("2d")!;
      const data = ctx.getImageData(0, 0, refCanvas.width, refCanvas.height).data;
      for (let i = 0; i < 4; i++) {
        const idx = Math.floor(rand() * (data.length / 4)) * 4;
        const hex =
          "#" +
          [data[idx], data[idx + 1], data[idx + 2]]
            .map((v) => v.toString(16).padStart(2, "0"))
            .join("");
        if (rand() < r.weight) palette.push(hex);
      }
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const ctx = canvas.getContext("2d")!;
  // Always start from current canvas state
  ctx.drawImage(source, 0, 0);

  // Determine fill region — full canvas, or mask bounds
  let x0 = 0,
    y0 = 0,
    w = dimensions.width,
    h = dimensions.height;
  let maskData: ImageData | null = null;
  if (mask) {
    const mCanvas = await bitmapToCanvas(mask);
    const mCtx = mCanvas.getContext("2d")!;
    maskData = mCtx.getImageData(0, 0, mCanvas.width, mCanvas.height);
    // Find bounding box
    let minX = mCanvas.width,
      minY = mCanvas.height,
      maxX = 0,
      maxY = 0;
    const d = maskData.data;
    for (let y = 0; y < mCanvas.height; y++) {
      for (let x = 0; x < mCanvas.width; x++) {
        const i = (y * mCanvas.width + x) * 4;
        if (d[i] > 128) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    x0 = minX;
    y0 = minY;
    w = maxX - minX;
    h = maxY - minY;
  }

  // Paint style-themed splotches in the fill region; clip to mask if present
  const splotches = 240 + Math.floor(rand() * 120);
  if (maskData) {
    // Use clipping via a temp canvas then draw with mask
    const tmp = document.createElement("canvas");
    tmp.width = dimensions.width;
    tmp.height = dimensions.height;
    const tctx = tmp.getContext("2d")!;
    for (let i = 0; i < splotches; i++) {
      const px = x0 + rand() * w;
      const py = y0 + rand() * h;
      const r = 6 + rand() * 24;
      tctx.globalAlpha = 0.2 + rand() * 0.5;
      tctx.fillStyle = palette[Math.floor(rand() * palette.length)];
      tctx.beginPath();
      tctx.arc(px, py, r, 0, Math.PI * 2);
      tctx.fill();
    }
    tctx.globalAlpha = 1;
    // Apply mask: only keep tmp pixels where mask is white
    const tmpData = tctx.getImageData(0, 0, tmp.width, tmp.height);
    const td = tmpData.data;
    const md = maskData.data;
    for (let i = 0; i < td.length; i += 4) {
      const a = md[i]; // mask uses red channel
      if (a < 128) td[i + 3] = 0;
    }
    tctx.putImageData(tmpData, 0, 0);
    ctx.drawImage(tmp, 0, 0);
  } else {
    for (let i = 0; i < splotches; i++) {
      const px = x0 + rand() * w;
      const py = y0 + rand() * h;
      const r = 8 + rand() * 32;
      ctx.globalAlpha = 0.2 + rand() * 0.5;
      ctx.fillStyle = palette[Math.floor(rand() * palette.length)];
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const image = await createImageBitmap(canvas);
  return { image, seed };
}

export const mockBackend: AIBackend = {
  async generate(req, onProgress) {
    const count = Math.max(1, Math.min(req.variations, 8));
    const baseSeed = req.seed ?? Math.floor(Math.random() * 1_000_000);
    const variations: AIVariation[] = [];
    // Fake progress
    let p = 0;
    const tick = () => {
      p = Math.min(95, p + 8 + Math.random() * 6);
      onProgress(p);
    };
    const iv = setInterval(tick, 80);
    try {
      // Generate sequentially so progress reads smoothly
      for (let i = 0; i < count; i++) {
        variations.push(await generateVariation(req, baseSeed + i * 7919));
        await new Promise((r) => setTimeout(r, 60));
      }
    } finally {
      clearInterval(iv);
      onProgress(100);
    }
    return { variations };
  },
};
