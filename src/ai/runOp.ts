import { aiBackend } from ".";
import { useChatStore } from "../state/chatStore";
import { useEditorStore } from "../state/editorStore";
import type { AIGenerateRequest } from "./types";

/**
 * Runs an AIGenerateRequest, updating the chat-store op-proposal as it streams,
 * and optionally auto-committing per current autonomy mode + confidence.
 */
export async function runOp(messageId: string, request: AIGenerateRequest, confidence: number) {
  const chat = useChatStore.getState();
  chat.updateOpProposal(messageId, { status: "generating", progress: 0 });

  try {
    const result = await aiBackend.generate(request, (p) => {
      useChatStore.getState().updateOpProposal(messageId, { progress: p });
    });

    chat.updateOpProposal(messageId, {
      status: "ready",
      progress: 100,
      variations: result.variations,
    });

    const autonomy = useEditorStore.getState().aiAutonomy;
    if (autonomy !== "propose" && confidence >= 0.8) {
      commitVariation(messageId, 0);
    }
  } catch (err) {
    console.error("[runOp] generate failed", err);
    chat.updateOpProposal(messageId, { status: "dismissed" });
    chat.appendActionLog(`⚠ Generation failed: ${err instanceof Error ? err.message : "unknown error"}`);
  }
}

export function commitVariation(messageId: string, variationIndex: number) {
  const chat = useChatStore.getState();
  const msg = chat.messages.find((m) => m.id === messageId);
  if (!msg || msg.role !== "assistant" || msg.kind !== "op-proposal" || !msg.variations) return;
  const variation = msg.variations[variationIndex];
  if (!variation) return;

  const editor = useEditorStore.getState();
  const provenance = {
    opId: msg.id,
    prompt: msg.request.prompt,
    mode: msg.request.mode,
    style: msg.request.style,
    seed: variation.seed,
    referenceIds: msg.request.references?.map((r) => r.id) ?? [],
  };
  const name = msg.request.prompt.slice(0, 32) || "Generated";
  const before = editor.addLayer(`✨ ${name}`, provenance);
  const ctx = before.canvas.getContext("2d")!;
  ctx.drawImage(variation.image, 0, 0);

  chat.updateOpProposal(messageId, { status: "committed", committedVariationIndex: variationIndex });
  chat.appendActionLog(`✓ Committed variation ${variationIndex + 1} → new layer "${name}"`);
  editor.bumpRender();
}

export function dismissOp(messageId: string) {
  useChatStore.getState().updateOpProposal(messageId, { status: "dismissed" });
}
