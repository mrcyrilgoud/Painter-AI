import type { Context } from "hono";
import { PNG } from "pngjs";
import { segmentSchema, formatZodError } from "./validation.js";
import { logError, logInfo, newRequestId } from "../log.js";

function decode(b64: string): { width: number; height: number; data: Buffer } {
  const raw = b64.replace(/^data:[^;]+;base64,/, "");
  const png = PNG.sync.read(Buffer.from(raw, "base64"));
  return { width: png.width, height: png.height, data: png.data };
}

function encodeMask(width: number, height: number, mask: Uint8Array): string {
  const png = new PNG({ width, height });
  for (let i = 0, j = 0; i < mask.length; i++, j += 4) {
    const v = mask[i] ? 255 : 0;
    png.data[j] = v;
    png.data[j + 1] = v;
    png.data[j + 2] = v;
    png.data[j + 3] = 255;
  }
  return PNG.sync.write(png).toString("base64");
}

function floodMask(src: { width: number; height: number; data: Buffer }, x: number, y: number, tolerance: number): Uint8Array {
  const { width, height, data } = src;
  const mask = new Uint8Array(width * height);
  const sx = Math.max(0, Math.min(width - 1, Math.round(x)));
  const sy = Math.max(0, Math.min(height - 1, Math.round(y)));
  const i0 = (sy * width + sx) * 4;
  const sr = data[i0],
    sg = data[i0 + 1],
    sb = data[i0 + 2];
  const stack: number[] = [sx, sy];
  while (stack.length > 0) {
    const py = stack.pop()!;
    const px = stack.pop()!;
    if (px < 0 || px >= width || py < 0 || py >= height) continue;
    const idx = py * width + px;
    if (mask[idx]) continue;
    const di = idx * 4;
    const d = Math.abs(data[di] - sr) + Math.abs(data[di + 1] - sg) + Math.abs(data[di + 2] - sb);
    if (d > tolerance * 3) continue;
    mask[idx] = 1;
    stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
  }
  return mask;
}

function rectMask(width: number, height: number, x: number, y: number, w: number, h: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let py = Math.max(0, y); py < Math.min(height, y + h); py++) {
    for (let px = Math.max(0, x); px < Math.min(width, x + w); px++) {
      mask[py * width + px] = 1;
    }
  }
  return mask;
}

function colorWordMask(
  src: { width: number; height: number; data: Buffer },
  prompt: string,
): { mask: Uint8Array; matchedKnownColor: boolean } {
  const targets: Array<[number, number, number]> = [];
  const p = prompt.toLowerCase();
  if (p.includes("red")) targets.push([200, 60, 60]);
  if (p.includes("blue") || p.includes("sky") || p.includes("water")) targets.push([120, 170, 220]);
  if (p.includes("green") || p.includes("tree") || p.includes("grass")) targets.push([80, 160, 90]);
  if (p.includes("yellow") || p.includes("sun")) targets.push([240, 220, 80]);
  if (p.includes("white") || p.includes("cloud")) targets.push([240, 240, 240]);
  if (p.includes("brown") || p.includes("wood") || p.includes("cottage") || p.includes("house"))
    targets.push([170, 110, 70]);
  const { width, height, data } = src;
  const mask = new Uint8Array(width * height);
  if (targets.length === 0) return { mask, matchedKnownColor: false };
  const TOL = 70;
  for (let i = 0, j = 0; i < mask.length; i++, j += 4) {
    for (const t of targets) {
      if (
        Math.abs(data[j] - t[0]) + Math.abs(data[j + 1] - t[1]) + Math.abs(data[j + 2] - t[2]) <
        TOL * 3
      ) {
        mask[i] = 1;
        break;
      }
    }
  }
  return { mask, matchedKnownColor: true };
}

function isAllZero(mask: Uint8Array): boolean {
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 0) return false;
  }
  return true;
}

export async function segmentRoute(c: Context) {
  const reqId = newRequestId();
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json", message: "request body must be JSON" }, 400);
  }
  const parsed = segmentSchema.safeParse(raw);
  if (!parsed.success) {
    logInfo(reqId, "/ai/segment", "rejected", { reason: formatZodError(parsed.error) });
    return c.json(
      { error: "invalid_request", message: formatZodError(parsed.error) },
      400,
    );
  }
  const body = parsed.data;

  const t0 = Date.now();
  logInfo(reqId, "/ai/segment", "start", { hint: body.hint.kind });
  try {
    const src = decode(body.sourcePngBase64);
    let mask: Uint8Array;
    let warning: "no_color_match" | "empty_mask" | undefined;
    switch (body.hint.kind) {
      case "point":
        mask = floodMask(src, body.hint.x, body.hint.y, body.hint.tolerance ?? 24);
        if (isAllZero(mask)) warning = "empty_mask";
        break;
      case "box":
        mask = rectMask(src.width, src.height, body.hint.x, body.hint.y, body.hint.w, body.hint.h);
        break;
      case "text": {
        const result = colorWordMask(src, body.hint.prompt);
        mask = result.mask;
        if (!result.matchedKnownColor) warning = "no_color_match";
        else if (isAllZero(mask)) warning = "empty_mask";
        break;
      }
    }
    logInfo(reqId, "/ai/segment", "ok", { ms: Date.now() - t0, warning });
    return c.json({
      maskPngBase64: encodeMask(src.width, src.height, mask),
      ...(warning ? { warning } : {}),
    });
  } catch (e) {
    logError(reqId, "/ai/segment", `failed after ${Date.now() - t0}ms`, e);
    return c.json(
      { error: "segmentation_failed", message: "Segmentation failed. Please try again." },
      500,
    );
  }
}
