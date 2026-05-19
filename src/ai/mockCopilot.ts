import type { CanvasContext, Copilot, CopilotEvent, AIGenerateRequest, AIMode } from "./types";

const CANNED_REPLIES = [
  "That's an interesting question — the composition feels balanced overall, but the focal point could be stronger.",
  "I'd say the lighting reads well; if you want more drama, try pushing the shadows deeper.",
  "Looks good to me! Let me know if you want to iterate on anything specific.",
];

function inferMode(message: string, ctx: CanvasContext): AIMode {
  const m = message.toLowerCase();
  if (m.includes("remove") || m.includes("erase") || m.includes("delete")) return "inpaint";
  if (m.includes("restyle") || m.includes("style") || m.includes("watercolor") || m.includes("painterly")) return "restyle";
  if (m.includes("variant") || m.includes("variation") || m.includes("again") || m.includes("more like")) return "img2img";
  if (m.includes("outpaint") || m.includes("extend") || m.includes("expand")) return "outpaint";
  if (ctx.selection) return "inpaint";
  return "newLayer";
}

function isActionable(message: string): boolean {
  const m = message.toLowerCase();
  const verbs = ["add", "make", "remove", "draw", "paint", "fill", "change", "give", "put", "create", "extend", "outpaint", "restyle"];
  return verbs.some((v) => new RegExp(`\\b${v}\\b`).test(m));
}

function inferStyle(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("watercolor")) return "watercolor";
  if (m.includes("oil")) return "oilpaint";
  if (m.includes("anime")) return "anime";
  if (m.includes("sketch")) return "sketch";
  if (m.includes("pixel")) return "pixel";
  return "none";
}

async function* generateText(text: string): AsyncIterable<CopilotEvent> {
  // Stream text in small chunks
  const chunks = text.match(/.{1,18}(\s|$)/g) ?? [text];
  for (const c of chunks) {
    await new Promise((r) => setTimeout(r, 30));
    yield { kind: "text", text: c };
  }
}

export const mockCopilot: Copilot = {
  async *send(userMessage: string, ctx: CanvasContext): AsyncIterable<CopilotEvent> {
    const actionable = isActionable(userMessage);
    if (!actionable) {
      const reply = CANNED_REPLIES[Math.floor(Math.random() * CANNED_REPLIES.length)];
      yield* generateText(reply);
      yield { kind: "done" };
      return;
    }
    const mode = inferMode(userMessage, ctx);
    const style = inferStyle(userMessage);
    yield* generateText(`Trying a few options — ${mode === "inpaint" ? "inpainting the selection" : mode === "outpaint" ? "extending the canvas" : "as a new layer"}.`);
    const req: AIGenerateRequest = {
      mode,
      source: ctx.source,
      mask: ctx.selection,
      prompt: userMessage,
      references: ctx.references,
      style,
      cfgScale: 7,
      steps: 20,
      variations: 4,
      dimensions: ctx.dimensions,
    };
    yield {
      kind: "op-proposal",
      request: req,
      confidence: 0.7 + Math.random() * 0.25,
    };
    yield { kind: "done" };
  },
};
