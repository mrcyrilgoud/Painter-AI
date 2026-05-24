import { describe, it, expect, vi, beforeEach } from "vitest";
import { codexCopilot } from "../src/ai/codex/codexCopilot";
import type { CanvasContext } from "../src/ai/types";

const chatMock = vi.fn();

vi.mock("../src/ai/codex/client", () => ({
  codexClient: {
    chat: (...args: unknown[]) => chatMock(...args),
  },
}));

vi.mock("../src/state/editorStore", () => ({
  useEditorStore: {
    getState: () => ({
      selection: { x: 10.2, y: 20.7, w: 50.4, h: 30.9 },
    }),
  },
}));

vi.mock("../src/state/settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({
      defaultVariations: 2,
    }),
  },
}));

const ctx: CanvasContext = {
  source: {} as ImageBitmap,
  selection: {} as ImageBitmap,
  layers: [],
  activeLayerId: "layer-1",
  recentOps: [],
  dimensions: { width: 512, height: 512 },
};

describe("codexCopilot", () => {
  beforeEach(() => {
    chatMock.mockReset();
  });

  it("includes maskBoundsPx for inpaint op proposals when a selection exists", async () => {
    chatMock.mockImplementation(async function* () {
      yield {
        kind: "op-proposal",
        request: { mode: "inpaint", prompt: "add clouds", style: "none" },
        confidence: 0.8,
      };
      yield { kind: "done" };
    });

    const events = [];
    for await (const event of codexCopilot.send("add clouds", ctx)) {
      events.push(event);
    }

    const proposal = events.find((e) => e.kind === "op-proposal");
    expect(proposal?.kind).toBe("op-proposal");
    if (proposal?.kind !== "op-proposal") return;

    expect(proposal.request.maskBoundsPx).toEqual({
      x: 10,
      y: 20,
      w: 51,
      h: 32,
    });
  });
});
