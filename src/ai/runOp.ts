import { aiBackend } from ".";
import { useChatStore } from "../state/chatStore";
import { useEditorStore } from "../state/editorStore";
import { useSettingsStore } from "../state/settingsStore";
import { pasteInfill } from "./compositeInfill";
import { inpaintCommitSelectionFromRequest } from "../utils/composite";
import { TimeoutError } from "./codex/client";
import type { AIGenerateRequest } from "./types";

const inflight = new Map<string, AbortController>();

/**
 * Runs an AIGenerateRequest, updating the chat-store op-proposal as it streams,
 * and optionally auto-committing per current autonomy mode + confidence.
 */
export async function runOp(messageId: string, request: AIGenerateRequest, confidence: number) {
  const chat = useChatStore.getState();
  if (request.mode === "inpaint") {
    useEditorStore.getState().exitSelectionMode();
  }
  chat.updateOpProposal(messageId, { status: "generating", progress: 0 });

  const ctrl = new AbortController();
  inflight.set(messageId, ctrl);

  try {
    const result = await aiBackend.generate(
      request,
      (p) => {
        useChatStore.getState().updateOpProposal(messageId, { progress: p });
      },
      ctrl.signal,
    );

    chat.updateOpProposal(messageId, {
      status: "ready",
      progress: 100,
      variations: result.variations,
    });

    const autonomy = useSettingsStore.getState().autonomy;
    if (autonomy !== "propose" && confidence >= 0.8) {
      commitVariation(messageId, 0);
    }
  } catch (err) {
    if (ctrl.signal.aborted && !(err instanceof TimeoutError)) {
      chat.updateOpProposal(messageId, { status: "dismissed" });
      chat.appendActionLog("⨯ Cancelled");
      useEditorStore.getState().exitSelectionMode();
      return;
    }
    console.error("[runOp] generate failed", err);
    chat.updateOpProposal(messageId, { status: "dismissed" });
    const msg = err instanceof Error ? err.message : "unknown error";
    chat.appendActionLog(`⚠ Generation failed: ${msg}`);
  } finally {
    inflight.delete(messageId);
  }
}

export function cancelOp(messageId: string) {
  const ctrl = inflight.get(messageId);
  if (ctrl) ctrl.abort();
}

export function commitVariation(messageId: string, variationIndex: number) {
  const chat = useChatStore.getState();
  const msg = chat.messages.find((m) => m.id === messageId);
  if (!msg || msg.role !== "assistant" || msg.kind !== "op-proposal" || !msg.variations) return;
  const variation = msg.variations[variationIndex];
  if (!variation) return;

  const editor = useEditorStore.getState();
  const settings = useSettingsStore.getState();
  const provenance = {
    opId: msg.id,
    prompt: msg.request.prompt,
    mode: msg.request.mode,
    style: msg.request.style,
    seed: variation.seed,
  };
  const name = msg.request.prompt.slice(0, 32) || "Generated";

  // Use the selection captured at generation time, not the live editor
  // selection — the user may have changed it since.
  if (msg.request.mode === "inpaint") {
    const commitSelection = inpaintCommitSelectionFromRequest(msg.request);
    const active = editor.layers.find((l) => l.id === editor.activeLayerId);
    if (!commitSelection) {
      chat.appendActionLog("⚠ Cannot commit inpaint: no selection bounds on this request");
      return;
    }
    if (!active) return;
    const { before, after } = pasteInfill(
      active.canvas,
      variation.image,
      commitSelection,
      settings.defaultFeatherPx,
      variation.regionBounds,
    );
    useEditorStore.setState((s) => ({
      layers: s.layers.map((l) =>
        l.id === active.id ? { ...l, aiProvenance: provenance } : l,
      ),
    }));
    editor.commitPixelChange(active.id, before, after);
    editor.exitSelectionMode();
    chat.updateOpProposal(messageId, { status: "committed", committedVariationIndex: variationIndex });
    chat.appendActionLog(`✓ Committed variation ${variationIndex + 1} → infill on "${active.name}"`);
    editor.bumpRender();
    return;
  }

  const layer = editor.addLayer(`✨ ${name}`, provenance);
  const ctx = layer.canvas.getContext("2d")!;
  const off = variation.regionBounds;
  ctx.drawImage(variation.image, off?.x ?? 0, off?.y ?? 0);

  chat.updateOpProposal(messageId, { status: "committed", committedVariationIndex: variationIndex });
  chat.appendActionLog(`✓ Committed variation ${variationIndex + 1} → new layer "${name}"`);
  editor.bumpRender();
}

export function dismissOp(messageId: string) {
  // cancelOp is a no-op if the op already finished. If it IS still in-flight,
  // the catch block in runOp handles status + log, so we only set dismissed
  // here when there's nothing in-flight to handle it.
  const wasInflight = inflight.has(messageId);
  cancelOp(messageId);
  if (!wasInflight) {
    useChatStore.getState().updateOpProposal(messageId, { status: "dismissed" });
  }
  useEditorStore.getState().exitSelectionMode();
}

/** Build a generate request using persisted settings defaults. */
export function buildGenerateRequest(
  partial: Pick<AIGenerateRequest, "mode" | "source" | "prompt"> &
    Partial<Pick<AIGenerateRequest, "mask" | "maskBoundsPx" | "dimensions">>,
): AIGenerateRequest {
  const settings = useSettingsStore.getState();
  const editor = useEditorStore.getState();
  return {
    mode: partial.mode,
    source: partial.source,
    mask: partial.mask,
    maskBoundsPx: partial.maskBoundsPx,
    prompt: partial.prompt,
    style: settings.defaultStyle,
    cfgScale: 7,
    steps: 20,
    variations: settings.defaultVariations,
    dimensions: partial.dimensions ?? editor.dimensions,
  };
}
