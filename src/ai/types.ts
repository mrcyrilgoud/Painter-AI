import type { StyleId } from "./styles";

export type AIMode = "inpaint" | "outpaint" | "newLayer" | "img2img" | "restyle";

export type AIAutonomy = "propose" | "auto-confident" | "agentic";

export type ImageProviderId =
  | "mock"
  | "openai"
  | "codex-canvas"
  | "cursor-canvas"
  | "gemini-canvas";

export interface AIGenerateRequest {
  mode: AIMode;
  source: ImageBitmap;
  mask?: ImageBitmap;
  /**
   * Tight bounding box of the masked region in source-image pixel space.
   * Set by the Infill button (which knows the selection rect directly) so
   * canvas-code providers can use the rect as their fill window without
   * scanning the mask. Optional — `mode === "inpaint"` works without it.
   */
  maskBoundsPx?: { x: number; y: number; w: number; h: number };
  prompt: string;
  style: StyleId;
  /** reserved for diffusion backends */
  cfgScale: number;
  /** reserved for diffusion backends */
  steps: number;
  seed?: number;
  variations: number;
  dimensions: { width: number; height: number };
}

export interface AIVariation {
  image: ImageBitmap;
  seed: number;
  /**
   * Set when `image` is sized to a subrect of the full canvas (inpaint-region
   * output). The image represents pixels positioned at `(regionBounds.x, .y)`
   * in source-image space. Omitting it means `image` is full-canvas.
   */
  regionBounds?: { x: number; y: number; w: number; h: number };
}

export interface AIGenerateResult {
  variations: AIVariation[];
  /** Set when the server returned region-sized inpaint patches. */
  boundsPx?: { x: number; y: number; w: number; h: number };
  outputKind?: "full-canvas" | "inpaint-region";
}

export interface AIBackend {
  generate(
    req: AIGenerateRequest,
    onProgress: (p: number) => void,
    signal?: AbortSignal,
  ): Promise<AIGenerateResult>;
}

export interface SegmentRequest {
  source: ImageBitmap;
  hint:
    | { kind: "point"; x: number; y: number }
    | { kind: "box"; x: number; y: number; w: number; h: number }
    | { kind: "text"; prompt: string };
}

export interface SegmentResult {
  mask: ImageBitmap;
  /** Set when the segmenter ran but couldn't produce a meaningful mask
   *  (e.g. a text hint matched no known colours). The caller should surface
   *  this to the user instead of silently selecting nothing. */
  warning?: "no_color_match" | "empty_mask";
  hint?: string;
}

export interface Segmenter {
  segment(req: SegmentRequest): Promise<SegmentResult>;
}

export interface CanvasContext {
  source: ImageBitmap;
  selection?: ImageBitmap;
  layers: { id: string; name: string; visible: boolean; isAI: boolean }[];
  activeLayerId: string;
  recentOps: { prompt: string; mode: AIMode; style: string }[];
  dimensions: { width: number; height: number };
}

export type CopilotEvent =
  | { kind: "text"; text: string }
  | {
      kind: "op-proposal";
      request: AIGenerateRequest;
      confidence: number;
      autoCommitHint?: { variationIndex: number };
    }
  | { kind: "chain-step"; stepIndex: number; totalSteps: number; summary: string }
  | { kind: "done" };

export interface Copilot {
  send(userMessage: string, context: CanvasContext): AsyncIterable<CopilotEvent>;
}
