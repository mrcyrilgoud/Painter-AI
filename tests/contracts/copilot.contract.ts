import { describe, it, expect } from "vitest";
import type { CanvasContext, Copilot, CopilotEvent } from "../../src/ai/types";

function makeBlankBitmap(w: number, h: number): Promise<ImageBitmap> {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.fillRect(0, 0, w, h);
  return createImageBitmap(c);
}

async function makeContext(): Promise<CanvasContext> {
  const w = 32;
  const h = 32;
  return {
    source: await makeBlankBitmap(w, h),
    layers: [{ id: "l0", name: "Background", visible: true, isAI: false }],
    activeLayerId: "l0",
    references: [],
    recentOps: [],
    dimensions: { width: w, height: h },
  };
}

async function collect(it: AsyncIterable<CopilotEvent>): Promise<CopilotEvent[]> {
  const out: CopilotEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

/**
 * Behavioural contract for any Copilot implementation. Every stream must end
 * with a `done` event; actionable prompts (verbs like "add", "remove") must
 * yield an `op-proposal` with a sensible request shape.
 */
export function copilotContract(name: string, factory: () => Copilot) {
  describe(`Copilot contract: ${name}`, () => {
    it("streams at least one text chunk for a conversational prompt", async () => {
      const copilot = factory();
      const ctx = await makeContext();
      const events = await collect(copilot.send("how does this look?", ctx));
      expect(events.some((e) => e.kind === "text")).toBe(true);
    });

    it("ends every stream with a `done` event", async () => {
      const copilot = factory();
      const ctx = await makeContext();
      const events = await collect(copilot.send("how does this look?", ctx));
      expect(events.at(-1)?.kind).toBe("done");
    });

    it("yields an op-proposal for an actionable prompt", async () => {
      const copilot = factory();
      const ctx = await makeContext();
      const events = await collect(copilot.send("add a small red square", ctx));
      const op = events.find((e) => e.kind === "op-proposal");
      expect(op).toBeDefined();
      if (op && op.kind === "op-proposal") {
        expect(op.request.prompt).toBeTruthy();
        expect(op.request.dimensions).toEqual(ctx.dimensions);
        expect(op.confidence).toBeGreaterThanOrEqual(0);
        expect(op.confidence).toBeLessThanOrEqual(1);
      }
    });
  });
}
