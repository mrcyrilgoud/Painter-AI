import { useEffect, useRef, useState } from "react";
import { useChatStore, type ChatMessage } from "../../state/chatStore";
import { useEditorStore } from "../../state/editorStore";
import { copilot } from "../../ai";
import type { CanvasContext } from "../../ai/types";
import { compositeBitmap, selectionToMask, selectionToMaskBoundsPx } from "../../utils/composite";
import { buildGenerateRequest, runOp } from "../../ai/runOp";
import { detectInpaintIntent } from "../../ai/contextInference";
import { OpProposalCard } from "./OpProposalCard";
import styles from "./AIPanel.module.css";

const SUGGESTIONS = [
  "add a small boat on the lake",
  "make the sky moodier",
  "what's weak in the composition?",
];

export function ChatTab() {
  const messages = useChatStore((s) => s.messages);
  const selection = useEditorStore((s) => s.selection);
  const dimensions = useEditorStore((s) => s.dimensions);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const runInfillFor = async (promptText: string) => {
    const editor = useEditorStore.getState();
    const sel = editor.selection;
    if (!sel) return;
    const source = await compositeBitmap(editor.layers, editor.dimensions);
    const mask = (await selectionToMask(sel, editor.dimensions))!;
    const request = buildGenerateRequest({
      mode: "inpaint",
      source,
      mask,
      maskBoundsPx: selectionToMaskBoundsPx(sel, editor.dimensions),
      prompt: promptText,
    });
    const chat = useChatStore.getState();
    const msgId = chat.appendOpProposal({
      role: "assistant",
      kind: "op-proposal",
      request,
      confidence: 0.9,
      via: "chat",
      status: "pending",
    });
    await runOp(msgId, request, 0.9);
  };

  const send = async (userText: string) => {
    if (!userText.trim() || busy) return;
    setBusy(true);
    setText("");
    const chat = useChatStore.getState();
    chat.appendUser(userText);

    try {
      const editor = useEditorStore.getState();

      // Short-circuit to inpaint when the prompt reads as a localized edit AND
      // a selection exists — avoids a copilot round-trip for the common case.
      if (detectInpaintIntent(userText)) {
        if (editor.selection) {
          try {
            await runInfillFor(userText);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "unknown error";
            chat.appendActionLog(`⚠ Infill error: ${msg}`);
          }
          return;
        }
        chat.appendActionLog(
          "ℹ Draw a selection over the area to edit, or rephrase as a whole-image change.",
        );
        return;
      }

      const source = await compositeBitmap(editor.layers, editor.dimensions);
      const mask = await selectionToMask(editor.selection, editor.dimensions);
      const ctx: CanvasContext = {
        source,
        selection: mask,
        layers: editor.layers.map((l) => ({
          id: l.id,
          name: l.name,
          visible: l.visible,
          isAI: !!l.aiProvenance,
        })),
        activeLayerId: editor.activeLayerId,
        recentOps: [],
        dimensions: editor.dimensions,
      };

      let textMsgId: string | null = null;
      try {
        for await (const event of copilot.send(userText, ctx)) {
          if (event.kind === "text") {
            if (textMsgId === null) {
              textMsgId = chat.appendAssistantText(event.text, true);
            } else {
              chat.upsertAssistantTextChunk(textMsgId, event.text, true);
            }
          } else if (event.kind === "op-proposal") {
            if (textMsgId !== null) {
              chat.upsertAssistantTextChunk(textMsgId, "", false);
              textMsgId = null;
            }
            const id = chat.appendOpProposal({
              role: "assistant",
              kind: "op-proposal",
              request: event.request,
              confidence: event.confidence,
              via: "chat",
              status: "pending",
            });
            // runOp swallows its own errors and writes an action-log entry;
            // we just guard the unhandled-rejection path.
            void runOp(id, event.request, event.confidence);
          } else if (event.kind === "done") {
            if (textMsgId !== null) {
              chat.upsertAssistantTextChunk(textMsgId, "", false);
              textMsgId = null;
            }
          }
        }
      } catch (err) {
        if (textMsgId !== null) {
          chat.upsertAssistantTextChunk(textMsgId, "", false);
        }
        const msg = err instanceof Error ? err.message : "unknown error";
        chat.appendActionLog(`⚠ Copilot error: ${msg}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const runInfill = async () => {
    const promptText = text.trim();
    if (!promptText || busy || !selection) return;
    setBusy(true);
    setText("");
    const chat = useChatStore.getState();
    chat.appendUser(promptText);
    try {
      await runInfillFor(promptText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      chat.appendActionLog(`⚠ Infill error: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const hasText = !!text.trim();
  const canSend = hasText && !busy;
  const canInpaint = canSend && !!selection;
  const isEmpty = messages.length === 0;

  return (
    <>
      <div className={styles.thread} ref={threadRef}>
        {isEmpty ? (
          <div className={styles.empty}>
            <div className={styles.emptyTitle}>Ask the canvas anything.</div>
            <div className={styles.emptyHint}>
              Paint, edit, or just talk about your image. Try:
            </div>
            <div className={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <button key={s} className={styles.suggestion} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <MessageRow key={m.id} message={m} />)
        )}
      </div>

      <div className={styles.composer}>
        {selection && (
          <div className={styles.selectionBanner}>
            <span className={styles.selectionDot} aria-hidden />
            <span className={styles.selectionLabel}>
              Editing {Math.round(selection.w)}×{Math.round(selection.h)} selection
            </span>
            <button
              type="button"
              className={styles.selectionClear}
              onClick={() => useEditorStore.getState().exitSelectionMode()}
              title="Clear selection (Esc)"
            >
              Clear
            </button>
          </div>
        )}

        <textarea
          className={styles.input}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (selection && (e.metaKey || e.ctrlKey)) {
                void send(text);
              } else if (selection) {
                void runInfill();
              } else {
                void send(text);
              }
            }
          }}
          placeholder={
            selection
              ? "Describe the edit for this region…"
              : "Type, paste, or @mention…"
          }
        />

        <div className={styles.composerActions}>
          <span className={styles.composerMeta}>
            {dimensions.width}×{dimensions.height}
          </span>
          {selection ? (
            <>
              <button
                className={styles.secondary}
                onClick={() => void send(text)}
                disabled={!canSend}
                title="Send to chat (⌘↵)"
              >
                Chat
              </button>
              <button
                className={styles.primary}
                onClick={() => void runInfill()}
                disabled={!canInpaint}
                title="Inpaint the selected region (↵)"
              >
                {busy ? "…" : "Inpaint ↵"}
              </button>
            </>
          ) : (
            <button
              className={styles.primary}
              onClick={() => void send(text)}
              disabled={!canSend}
            >
              {busy ? "…" : "Send ↵"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className={styles.userRow}>
        <div className={styles.userBubble}>{message.text}</div>
      </div>
    );
  }
  if (message.role === "system" && message.kind === "action-log") {
    return <div className={styles.actionLog}>{message.text}</div>;
  }
  if (message.role === "assistant" && message.kind === "text") {
    return (
      <div className={styles.assistantText}>
        {message.text}
        {message.streaming && <span className={styles.cursor}>▎</span>}
      </div>
    );
  }
  if (message.role === "assistant" && message.kind === "op-proposal") {
    return <OpProposalCard message={message} />;
  }
  return null;
}
