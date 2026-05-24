import type { ToolHandler } from "./types";
import { segmenter } from "../../../ai";
import { compositeBitmap } from "../../../utils/composite";

let busy = false;

export const smartSelectTool: ToolHandler = {
  id: "smart-select",
  cursor: "crosshair",
  onDown(ctx, p) {
    if (busy) {
      ctx.setStatus("Smart Select · still processing, please wait…");
      return;
    }
    busy = true;
    ctx.setStatus("Smart Select · segmenting…");
    void (async () => {
      try {
        const source = await compositeBitmap(ctx.state.layers, ctx.dimensions);
        const result = await segmenter.segment({
          source,
          hint: { kind: "point", x: Math.round(p.x), y: Math.round(p.y) },
        });
        if (result.warning === "empty_mask" || result.warning === "no_color_match") {
          ctx.setStatus(
            result.hint ?? "Smart Select · no matching region — try a different point",
          );
          ctx.setSelection(null);
          return;
        }
        // Compute bounding box of the mask
        const tmp = document.createElement("canvas");
        tmp.width = result.mask.width;
        tmp.height = result.mask.height;
        const tctx = tmp.getContext("2d")!;
        tctx.drawImage(result.mask, 0, 0);
        const data = tctx.getImageData(0, 0, tmp.width, tmp.height).data;
        const W = tmp.width;
        const H = tmp.height;
        let minX = W,
          minY = H,
          maxX = 0,
          maxY = 0,
          found = false;
        // Stride-based scan: increment by 4 per pixel, hoist the row index,
        // skip the per-pixel multiply.
        for (let y = 0; y < H; y++) {
          const rowOff = y * W * 4;
          for (let x = 0; x < W; x++) {
            if (data[rowOff + x * 4] > 128) {
              found = true;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (!found) {
          ctx.setStatus("Smart Select · no region found");
          ctx.setSelection(null);
          return;
        }
        ctx.setSelection({
          x: minX,
          y: minY,
          w: Math.max(1, maxX - minX + 1),
          h: Math.max(1, maxY - minY + 1),
        });
        ctx.setStatus(`Smart Select · ${maxX - minX + 1}×${maxY - minY + 1}`);
      } finally {
        busy = false;
      }
    })();
  },
  onMove() {},
  onUp() {},
};
