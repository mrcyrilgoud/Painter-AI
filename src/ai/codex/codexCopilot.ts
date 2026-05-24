import type { Copilot, CanvasContext, CopilotEvent, AIGenerateRequest } from "../types";
import { codexClient } from "./client";
import { serializeChatContext } from "./contextSerializer";
import { selectionToMaskBoundsPx } from "../../utils/composite";
import { useEditorStore } from "../../state/editorStore";
import { useSettingsStore } from "../../state/settingsStore";

interface ServerEvent {
  kind: "text" | "op-proposal" | "done";
  text?: string;
  request?: { mode: AIGenerateRequest["mode"]; prompt: string; style: string };
  confidence?: number;
}

export const codexCopilot: Copilot = {
  async *send(userMessage: string, ctx: CanvasContext): AsyncIterable<CopilotEvent> {
    // Selection bounds (if any) for the server description
    const editor = useEditorStore.getState();
    const sel = editor.selection
      ? { x: editor.selection.x, y: editor.selection.y, w: editor.selection.w, h: editor.selection.h }
      : undefined;

    const body = {
      message: userMessage,
      context: serializeChatContext(ctx, sel),
    };

    for await (const raw of codexClient.chat(body)) {
      const evt = raw as ServerEvent;
      if (evt.kind === "text" && typeof evt.text === "string") {
        yield { kind: "text", text: evt.text };
      } else if (evt.kind === "op-proposal" && evt.request) {
        const maskBoundsPx =
          evt.request.mode === "inpaint" && sel
            ? selectionToMaskBoundsPx(sel, ctx.dimensions)
            : undefined;

        const settings = useSettingsStore.getState();
        const fullReq: AIGenerateRequest = {
          mode: evt.request.mode,
          source: ctx.source,
          mask: ctx.selection,
          maskBoundsPx,
          prompt: evt.request.prompt,
          style: evt.request.style as AIGenerateRequest["style"],
          cfgScale: 7,
          steps: 20,
          variations: settings.defaultVariations,
          dimensions: ctx.dimensions,
        };
        yield {
          kind: "op-proposal",
          request: fullReq,
          confidence: evt.confidence ?? 0.75,
        };
      } else if (evt.kind === "done") {
        yield { kind: "done" };
      }
    }
  },
};
