import { describe, it, expect, beforeAll } from "vitest";
import {
  selectionToMaskBoundsPx,
  inpaintCommitSelectionFromRequest,
} from "../src/utils/composite";
import type { AIGenerateRequest } from "../src/ai/types";

describe("selectionToMaskBoundsPx", () => {
  it("fully encloses fractional selection edges", () => {
    expect(selectionToMaskBoundsPx({ x: 10.9, y: 0, w: 50.1, h: 10 })).toEqual({
      x: 10,
      y: 0,
      w: 51,
      h: 10,
    });
  });

  it("uses ceil on far edges for copilot-style fractional rects", () => {
    expect(selectionToMaskBoundsPx({ x: 10.2, y: 20.7, w: 50.4, h: 30.9 })).toEqual({
      x: 10,
      y: 20,
      w: 51,
      h: 32,
    });
  });

  it("clamps to canvas dimensions when provided", () => {
    expect(
      selectionToMaskBoundsPx(
        { x: 500, y: 500, w: 20, h: 20 },
        { width: 512, height: 512 },
      ),
    ).toEqual({
      x: 500,
      y: 500,
      w: 12,
      h: 12,
    });
  });
});

describe("inpaintCommitSelectionFromRequest", () => {
  let source: ImageBitmap;

  beforeAll(async () => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    source = await createImageBitmap(c);
  });

  it("prefers maskBoundsPx captured at generation time", () => {
    const request: AIGenerateRequest = {
      mode: "inpaint",
      source,
      prompt: "test",
      style: "none",
      cfgScale: 7,
      steps: 20,
      variations: 1,
      dimensions: { width: 16, height: 16 },
      maskBoundsPx: { x: 1, y: 2, w: 10, h: 8 },
    };
    expect(inpaintCommitSelectionFromRequest(request)).toEqual({
      x: 1,
      y: 2,
      w: 10,
      h: 8,
    });
  });

  it("returns null when no captured bounds or mask are available", () => {
    const request: AIGenerateRequest = {
      mode: "inpaint",
      source,
      prompt: "test",
      style: "none",
      cfgScale: 7,
      steps: 20,
      variations: 1,
      dimensions: { width: 16, height: 16 },
    };
    expect(inpaintCommitSelectionFromRequest(request)).toBeNull();
  });
});
