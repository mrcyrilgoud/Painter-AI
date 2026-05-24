import { describe, it, expect, beforeEach, vi } from "vitest";
import { useEditorStore } from "../src/state/editorStore";
import { useChatStore } from "../src/state/chatStore";
import { commitVariation } from "../src/ai/runOp";
import type { AIGenerateRequest } from "../src/ai/types";

vi.mock("../src/ai/compositeInfill", () => ({
  pasteInfill: vi.fn(() => ({
    before: new ImageData(1, 1),
    after: new ImageData(1, 1),
    dirtyRect: new DOMRect(0, 0, 1, 1),
  })),
}));

describe("commitVariation inpaint", () => {
  beforeEach(() => {
    useEditorStore.getState().resetProject("sq-512");
    useChatStore.setState({ messages: [] });
  });

  it("refuses commit when inpaint request has no captured bounds", () => {
    const source = document.createElement("canvas");
    source.width = 16;
    source.height = 16;
    const request: AIGenerateRequest = {
      mode: "inpaint",
      source: null as unknown as ImageBitmap,
      prompt: "test",
      style: "none",
      cfgScale: 7,
      steps: 20,
      variations: 1,
      dimensions: { width: 16, height: 16 },
    };
    const msgId = useChatStore.getState().appendOpProposal({
      role: "assistant",
      kind: "op-proposal",
      request,
      confidence: 0.9,
      via: "chat",
      status: "ready",
    });
    useChatStore.getState().updateOpProposal(msgId, {
      variations: [{ image: source as unknown as ImageBitmap, seed: 1 }],
    });

    const layersBefore = useEditorStore.getState().layers.length;
    commitVariation(msgId, 0);

    expect(useEditorStore.getState().layers).toHaveLength(layersBefore);
    const logs = useChatStore
      .getState()
      .messages.filter((m) => m.role === "system" && m.kind === "action-log");
    expect(logs.some((m) => m.text.includes("no selection bounds"))).toBe(true);
  });
});
