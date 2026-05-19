import { z, ZodError } from "zod";

const MAX_PROMPT = 5000;
const MIN_DIM = 64;
const MAX_DIM = 4096;
const MAX_VARIATIONS = 4;
// ~10 MB of base64 = ~7.5 MB raw bytes — enough for a 4k PNG, low enough to bound memory.
const MAX_BASE64_BYTES = 10 * 1024 * 1024;

const base64Image = z
  .string()
  .max(MAX_BASE64_BYTES, "image data too large")
  .optional();

const requiredBase64Image = z.string().max(MAX_BASE64_BYTES, "image data too large");

const dimension = z.number().int().min(MIN_DIM).max(MAX_DIM);

export const generateSchema = z.object({
  prompt: z.string().min(1).max(MAX_PROMPT),
  style: z.string().max(64).optional(),
  width: dimension,
  height: dimension,
  variations: z.number().int().min(1).max(MAX_VARIATIONS),
  seed: z.number().int().optional(),
  mode: z
    .enum(["inpaint", "outpaint", "newLayer", "img2img", "restyle"])
    .default("newLayer"),
  sourcePngBase64: base64Image,
  maskPngBase64: base64Image,
  references: z
    .array(
      z.object({
        pngBase64: requiredBase64Image,
        role: z.string().max(64).optional(),
        weight: z.number().min(0).max(1).optional(),
      }),
    )
    .max(8)
    .optional(),
});

export const segmentSchema = z.object({
  width: dimension,
  height: dimension,
  sourcePngBase64: requiredBase64Image,
  hint: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("point"),
      x: z.number(),
      y: z.number(),
      tolerance: z.number().min(0).max(255).optional(),
    }),
    z.object({
      kind: z.literal("box"),
      x: z.number(),
      y: z.number(),
      w: z.number().min(0),
      h: z.number().min(0),
    }),
    z.object({
      kind: z.literal("text"),
      prompt: z.string().min(1).max(MAX_PROMPT),
    }),
  ]),
});

export const chatSchema = z.object({
  message: z.string().min(1).max(MAX_PROMPT),
  context: z.object({
    dimensions: z.object({ width: dimension, height: dimension }),
    hasSelection: z.boolean(),
    selectionBounds: z
      .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
      .optional(),
    layers: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          visible: z.boolean(),
          isAI: z.boolean(),
        }),
      )
      .max(256),
    references: z
      .array(z.object({ role: z.string(), weight: z.number() }))
      .max(16),
    recentOps: z
      .array(
        z.object({
          prompt: z.string().max(MAX_PROMPT),
          mode: z.string(),
          style: z.string(),
        }),
      )
      .max(32),
  }),
});

export type GenerateInput = z.infer<typeof generateSchema>;
export type SegmentInput = z.infer<typeof segmentSchema>;
export type ChatInput = z.infer<typeof chatSchema>;

export function formatZodError(err: ZodError): string {
  return err.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}
