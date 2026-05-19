export interface ImageGenRequest {
  prompt: string;
  width: number;
  height: number;
  mode: "inpaint" | "outpaint" | "newLayer" | "img2img" | "restyle";
  /** base64-encoded PNG of the current canvas */
  sourcePngBase64?: string;
  /** base64-encoded PNG of the mask (white = generate, black = keep) */
  maskPngBase64?: string;
  /** style preset id ("none", "watercolor", ...) used for non-OpenAI providers */
  style?: string;
  variations: number;
  seed?: number;
}

export interface ImageGenResult {
  /** base64 PNG bytes, one per variation, full project resolution */
  variationsBase64: string[];
  seeds: number[];
}

export interface ImageProvider {
  name: string;
  isReady(): { ready: boolean; reason?: string };
  generate(req: ImageGenRequest): Promise<ImageGenResult>;
}
