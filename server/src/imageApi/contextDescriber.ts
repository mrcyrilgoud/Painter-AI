import { createCanvas, loadImage } from "canvas";
import type { Image } from "canvas";
import { stripBase64DataUrl } from "./pngUtils.js";

/**
 * Build a structured text description of the image surrounding a masked
 * rectangle. Fed to canvas-code (Codex/Gemini) providers as a soft constraint
 * so the generated `draw()` snippet can match the surrounding palette and
 * edge content even though the model itself can't see images.
 */
export interface ContextDescription {
  /** Rendered text blob to splice into the system/user prompt. */
  text: string;
  /** Dominant boundary colors as #rrggbb, ordered by frequency. */
  boundaryPalette: string[];
  /** Average color of each edge of the boundary band: top/right/bottom/left. */
  edgeColors: { top: string; right: string; bottom: string; left: string };
  /**
   * Actual pixel rows sampled immediately outside each edge of the mask rect.
   * edgeRows.top[0] = row closest to the top edge (row 0 is nearest, row N farthest).
   * Each row is downsampled to EDGE_SAMPLES_PER_ROW hex strings.
   */
  edgeRows: { top: string[][]; right: string[][]; bottom: string[][]; left: string[][] };
}

const BAND_WIDTH_PX = 24;   // widened from 8 to capture gradient context
const PALETTE_BUCKETS = 16;
const THUMBNAIL_GRID = 4;
const EDGE_ROW_COUNT = 3;   // rows sampled per side
const EDGE_SAMPLES_PER_ROW = 12; // hex samples per row (evenly spaced)

/** 4-bit precision quantization — preserves mid-tones unlike the old 2-bit crush. */
function quantize(v: number): number {
  return Math.round(v / 16) * 16;
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

interface Rect { x: number; y: number; w: number; h: number }

function clampRect(r: Rect, imgW: number, imgH: number): Rect {
  const x = Math.max(0, Math.min(imgW, r.x));
  const y = Math.max(0, Math.min(imgH, r.y));
  const w = Math.max(0, Math.min(imgW - x, r.w));
  const h = Math.max(0, Math.min(imgH - y, r.h));
  return { x, y, w, h };
}

/**
 * Copy `rect` from the source image into a freshly-allocated RGBA buffer sized
 * to `rect`. One drawImage + one getImageData — no full-image scratch buffer.
 */
function extractRect(img: Image, rect: Rect): Uint8ClampedArray {
  if (rect.w <= 0 || rect.h <= 0) return new Uint8ClampedArray(0);
  const c = createCanvas(rect.w, rect.h);
  const cx = c.getContext("2d");
  cx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  return cx.getImageData(0, 0, rect.w, rect.h).data as unknown as Uint8ClampedArray;
}

interface PaletteHist {
  hist: Map<number, number>;
  total: number;
}

function accumulatePaletteFromBuffer(data: Uint8ClampedArray, pal: PaletteHist): void {
  for (let i = 0; i < data.length; i += 4) {
    const key = (quantize(data[i]) << 16) | (quantize(data[i + 1]) << 8) | quantize(data[i + 2]);
    pal.hist.set(key, (pal.hist.get(key) ?? 0) + 1);
    pal.total++;
  }
}

function avgColorFromBuffer(data: Uint8ClampedArray): { r: number; g: number; b: number } {
  if (data.length === 0) return { r: 0, g: 0, b: 0 };
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]; g += data[i + 1]; b += data[i + 2];
  }
  const n = data.length / 4;
  return { r: r / n, g: g / n, b: b / n };
}

function topPalette(pal: PaletteHist, k: number): { hex: string; pct: number }[] {
  if (pal.total === 0) return [];
  const sorted = Array.from(pal.hist.entries()).sort((a, b) => b[1] - a[1]).slice(0, k);
  return sorted.map(([key, count]) => ({
    hex: rgbToHex((key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff),
    pct: count / pal.total,
  }));
}

function bandsFor(
  bounds: Rect,
  imgW: number,
  imgH: number,
  band = BAND_WIDTH_PX,
): { top: Rect; right: Rect; bottom: Rect; left: Rect } {
  const x0 = Math.max(0, bounds.x - band);
  const y0 = Math.max(0, bounds.y - band);
  const x1 = Math.min(imgW, bounds.x + bounds.w + band);
  const y1 = Math.min(imgH, bounds.y + bounds.h + band);
  const topY1 = Math.max(y0, bounds.y);
  const botY0 = Math.min(y1, bounds.y + bounds.h);
  const leftX1 = Math.max(x0, bounds.x);
  const rightX0 = Math.min(x1, bounds.x + bounds.w);
  return {
    top:    { x: x0, y: y0,     w: x1 - x0,         h: topY1 - y0    },
    right:  { x: rightX0, y: y0, w: x1 - rightX0,   h: y1 - y0       },
    bottom: { x: x0, y: botY0,  w: x1 - x0,         h: y1 - botY0    },
    left:   { x: x0, y: y0,     w: leftX1 - x0,     h: y1 - y0       },
  };
}

/**
 * Pull `numRows` pixel rows on the outside of each mask edge, downsampled to
 * `samplesPerRow` evenly-spaced hex values per row. Each side reads a single
 * thin strip via drawImage — no full-image buffer required.
 */
function sampleEdgeRows(
  img: Image,
  imgW: number,
  imgH: number,
  bounds: Rect,
  numRows = EDGE_ROW_COUNT,
  samplesPerRow = EDGE_SAMPLES_PER_ROW,
): ContextDescription["edgeRows"] {
  const result: ContextDescription["edgeRows"] = { top: [], right: [], bottom: [], left: [] };

  const horizontalStrip = (yStart: number, count: number): { strip: Uint8ClampedArray; w: number } | null => {
    const yMin = Math.max(0, yStart);
    const yMax = Math.min(imgH, yStart + count);
    if (yMax <= yMin) return null;
    const rx = Math.max(0, bounds.x);
    const rw = Math.min(imgW - rx, bounds.w);
    if (rw <= 0) return null;
    const strip = extractRect(img, { x: rx, y: yMin, w: rw, h: yMax - yMin });
    return { strip, w: rw };
  };

  const verticalStrip = (xStart: number, count: number): { strip: Uint8ClampedArray; h: number } | null => {
    const xMin = Math.max(0, xStart);
    const xMax = Math.min(imgW, xStart + count);
    if (xMax <= xMin) return null;
    const cy = Math.max(0, bounds.y);
    const ch = Math.min(imgH - cy, bounds.h);
    if (ch <= 0) return null;
    const strip = extractRect(img, { x: xMin, y: cy, w: xMax - xMin, h: ch });
    return { strip, h: ch };
  };

  const sampleHorizontalRow = (strip: Uint8ClampedArray, stripW: number, rowIdx: number): string[] => {
    const out: string[] = [];
    for (let s = 0; s < samplesPerRow; s++) {
      const offset = Math.min(stripW - 1, Math.floor((s / (samplesPerRow - 1)) * (stripW - 1)));
      const i = (rowIdx * stripW + offset) * 4;
      out.push(rgbToHex(strip[i], strip[i + 1], strip[i + 2]));
    }
    return out;
  };

  const sampleVerticalCol = (strip: Uint8ClampedArray, stripW: number, stripH: number, colIdx: number): string[] => {
    const out: string[] = [];
    for (let s = 0; s < samplesPerRow; s++) {
      const offset = Math.min(stripH - 1, Math.floor((s / (samplesPerRow - 1)) * (stripH - 1)));
      const i = (offset * stripW + colIdx) * 4;
      out.push(rgbToHex(strip[i], strip[i + 1], strip[i + 2]));
    }
    return out;
  };

  // Top: rows above the mask. Strip covers rows [bounds.y - numRows, bounds.y).
  const topStrip = horizontalStrip(bounds.y - numRows, numRows);
  for (let ri = 0; ri < numRows; ri++) {
    const ry = bounds.y - 1 - ri;
    if (!topStrip || ry < 0) {
      result.top.push([]);
      continue;
    }
    const rowInStrip = ry - Math.max(0, bounds.y - numRows);
    result.top.push(sampleHorizontalRow(topStrip.strip, topStrip.w, rowInStrip));
  }

  // Bottom: rows below the mask.
  const botStrip = horizontalStrip(bounds.y + bounds.h, numRows);
  for (let ri = 0; ri < numRows; ri++) {
    const ry = bounds.y + bounds.h + ri;
    if (!botStrip || ry >= imgH) {
      result.bottom.push([]);
      continue;
    }
    const rowInStrip = ry - (bounds.y + bounds.h);
    result.bottom.push(sampleHorizontalRow(botStrip.strip, botStrip.w, rowInStrip));
  }

  // Left: columns to the left of the mask.
  const leftStrip = verticalStrip(bounds.x - numRows, numRows);
  for (let ri = 0; ri < numRows; ri++) {
    const cx = bounds.x - 1 - ri;
    if (!leftStrip || cx < 0) {
      result.left.push([]);
      continue;
    }
    const stripW = Math.min(imgW, bounds.x) - Math.max(0, bounds.x - numRows);
    const colInStrip = cx - Math.max(0, bounds.x - numRows);
    result.left.push(sampleVerticalCol(leftStrip.strip, stripW, leftStrip.h, colInStrip));
  }

  // Right: columns to the right of the mask.
  const rightStrip = verticalStrip(bounds.x + bounds.w, numRows);
  for (let ri = 0; ri < numRows; ri++) {
    const cx = bounds.x + bounds.w + ri;
    if (!rightStrip || cx >= imgW) {
      result.right.push([]);
      continue;
    }
    const stripStartX = bounds.x + bounds.w;
    const stripW = Math.min(imgW, stripStartX + numRows) - stripStartX;
    const colInStrip = cx - stripStartX;
    result.right.push(sampleVerticalCol(rightStrip.strip, stripW, rightStrip.h, colInStrip));
  }

  return result;
}

function formatEdgeRows(edgeRows: ContextDescription["edgeRows"]): string {
  const lines: string[] = [];
  for (const [side, rows] of Object.entries(edgeRows) as Array<[keyof typeof edgeRows, string[][]]>) {
    rows.forEach((hexes, idx) => {
      if (hexes.length > 0) {
        lines.push(`  ${side} row-${idx}: ${JSON.stringify(hexes)}`);
      }
    });
  }
  return lines.join("\n");
}

/**
 * Decode a base64 PNG and return a contextual description of the area
 * surrounding `bounds` (the masked region). Used by canvas-code providers.
 *
 * Reads only the rects it needs — each band, each edge strip, and a tiny 4×4
 * downscale for the global grid — so cost scales with mask size, not source
 * size.
 */
export async function describeContext(
  sourcePngBase64: string,
  bounds: Rect,
  width: number,
  height: number,
): Promise<ContextDescription> {
  const buf = Buffer.from(stripBase64DataUrl(sourcePngBase64), "base64");
  const img = await loadImage(buf);

  // Boundary palette + edge colors — read each band as its own small rect.
  const bands = bandsFor(bounds, width, height);
  const edgeColors = { top: "#000000", right: "#000000", bottom: "#000000", left: "#000000" };
  const palAccum: PaletteHist = { hist: new Map(), total: 0 };
  for (const [side, rect] of Object.entries(bands) as Array<[keyof typeof bands, Rect]>) {
    const r = clampRect(rect, width, height);
    if (r.w <= 0 || r.h <= 0) continue;
    const data = extractRect(img, r);
    const avg = avgColorFromBuffer(data);
    edgeColors[side] = rgbToHex(avg.r, avg.g, avg.b);
    accumulatePaletteFromBuffer(data, palAccum);
  }
  const palette = topPalette(palAccum, PALETTE_BUCKETS);

  // Per-side edge rows (actual pixel colors at boundary).
  const edgeRows = sampleEdgeRows(img, width, height, bounds);

  // Global thumbnail grid — let the canvas implementation average pixels for us
  // by drawing the source onto a GRID×GRID canvas. Reads GRID² pixels total.
  const gridCanvas = createCanvas(THUMBNAIL_GRID, THUMBNAIL_GRID);
  const gridCtx = gridCanvas.getContext("2d");
  gridCtx.drawImage(img, 0, 0, width, height, 0, 0, THUMBNAIL_GRID, THUMBNAIL_GRID);
  const gridData = gridCtx.getImageData(0, 0, THUMBNAIL_GRID, THUMBNAIL_GRID).data;
  const grid: string[][] = [];
  for (let row = 0; row < THUMBNAIL_GRID; row++) {
    const cols: string[] = [];
    for (let col = 0; col < THUMBNAIL_GRID; col++) {
      const i = (row * THUMBNAIL_GRID + col) * 4;
      cols.push(rgbToHex(gridData[i], gridData[i + 1], gridData[i + 2]));
    }
    grid.push(cols);
  }

  const paletteLine = palette
    .slice(0, 6)
    .map((p) => `${p.hex} (${Math.round(p.pct * 100)}%)`)
    .join(", ");
  const text =
    `Boundary palette: ${paletteLine || "(empty)"}\n` +
    `Edge colors — top: ${edgeColors.top}, right: ${edgeColors.right}, ` +
    `bottom: ${edgeColors.bottom}, left: ${edgeColors.left}\n` +
    `Edge rows (row-0 = closest to fill boundary, ${EDGE_SAMPLES_PER_ROW} samples/side):\n` +
    formatEdgeRows(edgeRows) + "\n" +
    `Global thumbnail ${THUMBNAIL_GRID}x${THUMBNAIL_GRID}: ${JSON.stringify(grid)}`;

  return {
    text,
    boundaryPalette: palette.map((p) => p.hex),
    edgeColors,
    edgeRows,
  };
}
