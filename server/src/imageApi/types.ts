export interface ImageGenRequest {
  prompt: string;
  width: number;
  height: number;
  mode: "inpaint" | "outpaint" | "newLayer" | "img2img" | "restyle";
  /** base64-encoded PNG of the current canvas */
  sourcePngBase64?: string;
  /** base64-encoded PNG of the mask (white = generate, black = keep) */
  maskPngBase64?: string;
  /**
   * Tight bounding box of the masked region, in source-image pixel space.
   * Sent by the client alongside the mask so canvas-code providers don't
   * need to re-decode the mask just to find the edit window. Optional —
   * if absent, providers should fall back to scanning the mask PNG.
   */
  maskBoundsPx?: { x: number; y: number; w: number; h: number };
  /** style preset id ("none", "watercolor", ...) used for non-OpenAI providers */
  style?: string;
  variations: number;
  seed?: number;
}

export interface ImageGenResult {
  /** base64 PNG bytes, one per variation, full project resolution or inpaint region */
  variationsBase64: string[];
  seeds: number[];
  /** Present when variations are region-sized inpaint patches. */
  boundsPx?: { x: number; y: number; w: number; h: number };
  outputKind?: "full-canvas" | "inpaint-region";
}

export interface ImageProviderGenerateOptions {
  signal?: AbortSignal;
  modelOverride?: string | null;
}

export interface ImageProvider {
  name: string;
  isReady(): { ready: boolean; reason?: string };
  generate(
    req: ImageGenRequest,
    options?: ImageProviderGenerateOptions,
  ): Promise<ImageGenResult>;
}
