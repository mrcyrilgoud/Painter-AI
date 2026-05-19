import { useEffect, useRef, useState } from "react";
import { useChatStore, type ChatMessage } from "../../state/chatStore";
import { useEditorStore } from "../../state/editorStore";
import { copilot } from "../../ai";
import type { CanvasContext } from "../../ai/types";
import { compositeBitmap, selectionToMask } from "../../utils/composite";
import { runOp } from "../../ai/runOp";
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
  const references = useEditorStore((s) => s.references);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = async (userText: string) => {
    if (!userText.trim() || busy) return;
    setBusy(true);
    setText("");
    const chat = useChatStore.getState();
    chat.appendUser(userText);

    try {
      const editor = useEditorStore.getState();
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
        references: editor.references,
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

  return (
    <>
      <div className={styles.thread} ref={threadRef}>
        {messages.length === 0 && (
          <>
            <div className={`${styles.bubble} ${styles.assistant}`}>
              Hi — I can paint, edit, or just talk about your canvas. Try one of these:
            </div>
            <div className={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <button key={s} className={styles.chip} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}
      </div>

      <div className={styles.composer}>
        <div className={styles.contextChip}>
          {selection
            ? `Selection · ${Math.round(selection.w)}×${Math.round(selection.h)}`
            : "No selection"}{" "}
          · {references.length} reference{references.length === 1 ? "" : "s"} · {dimensions.width}×{dimensions.height}
        </div>
        <textarea
          className={styles.input}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(text);
            }
          }}
          placeholder="Type, paste, or @mention…"
        />
        <div className={styles.composerActions}>
          <span className={styles.spacer} />
          <button
            className={styles.primary}
            onClick={() => void send(text)}
            disabled={busy || !text.trim()}
          >
            {busy ? "…" : "Send ↵"}
          </button>
        </div>
      </div>
    </>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return <div className={`${styles.bubble} ${styles.user}`}>{message.text}</div>;
  }
  if (message.role === "system" && message.kind === "action-log") {
    return <div className={styles.actionLog}>{message.text}</div>;
  }
  if (message.role === "assistant" && message.kind === "text") {
    return <div className={`${styles.bubble} ${styles.assistant}`}>{message.text}{message.streaming && <span className={styles.cursor}>▎</span>}</div>;
  }
  if (message.role === "assistant" && message.kind === "op-proposal") {
    return <OpProposalCard message={message} />;
  }
  return null;
}
