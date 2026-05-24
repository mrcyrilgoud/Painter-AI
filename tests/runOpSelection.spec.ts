import { describe, it, expect, vi, beforeEach } from "vitest";
import { useEditorStore } from "../src/state/editorStore";
import { useChatStore } from "../src/state/chatStore";
import { runOp } from "../src/ai/runOp";
import type { AIGenerateRequest } from "../src/ai/types";

vi.mock("../src/ai", () => ({
  aiBackend: {
    generate: vi.fn(() => new Promise(() => {})),
  },
}));

describe("runOp inpaint selection", () => {
  beforeEach(() => {
    useEditorStore.getState().resetProject("sq-512");
    useChatStore.setState({ messages: [] });
  });

  it("keeps selection visible while generating", async () => {
    useEditorStore.getState().setSelection({ x: 10, y: 10, w: 50, h: 50 });
    const request: AIGenerateRequest = {
      mode: "inpaint",
      source: null as unknown as ImageBitmap,
      prompt: "test",
      style: "none",
      cfgScale: 7,
      steps: 20,
      variations: 1,
      dimensions: { width: 512, height: 512 },
    };
    const msgId = useChatStore.getState().appendOpProposal({
      role: "assistant",
      kind: "op-proposal",
      request,
      confidence: 0.9,
      via: "chat",
      status: "idle",
    });

    void runOp(msgId, request, 0.9);
    expect(useEditorStore.getState().selection).not.toBeNull();
  });
});
