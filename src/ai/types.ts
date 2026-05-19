export type AIMode = "inpaint" | "outpaint" | "newLayer" | "img2img" | "restyle";

export interface ReferenceImage {
  id: string;
  image: ImageBitmap;
  role: "style" | "subject" | "composition" | "color";
  weight: number;
}

export interface AIGenerateRequest {
  mode: AIMode;
  source: ImageBitmap;
  mask?: ImageBitmap;
  prompt: string;
  references?: ReferenceImage[];
  style: string;
  cfgScale: number;
  steps: number;
  seed?: number;
  variations: number;
  dimensions: { width: number; height: number };
}

export interface AIVariation {
  image: ImageBitmap;
  seed: number;
}

export interface AIGenerateResult {
  variations: AIVariation[];
}

export interface AIBackend {
  generate(
    req: AIGenerateRequest,
    onProgress: (p: number) => void,
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
}

export interface Segmenter {
  segment(req: SegmentRequest): Promise<SegmentResult>;
}

export interface CanvasContext {
  source: ImageBitmap;
  selection?: ImageBitmap;
  layers: { id: string; name: string; visible: boolean; isAI: boolean }[];
  activeLayerId: string;
  references: ReferenceImage[];
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
