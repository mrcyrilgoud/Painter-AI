import { useEffect, useRef, useState } from "react";
import { useUIStore } from "../../state/uiStore";
import { useEditorStore } from "../../state/editorStore";
import { useChatStore } from "../../state/chatStore";
import { inferModeFromContext, MODE_LABELS } from "../../ai/contextInference";
import { compositeBitmap, selectionToMask } from "../../utils/composite";
import { runOp } from "../../ai/runOp";
import { OpProposalCard } from "../AIPanel/OpProposalCard";
import type { AIGenerateRequest } from "../../ai/types";
import styles from "./CommandBar.module.css";

export function CommandBar() {
  const open = useUIStore((s) => s.commandBarOpen);
  const close = useUIStore((s) => s.closeCommandBar);
  const toggle = useUIStore((s) => s.toggleCommandBar);

  const selection = useEditorStore((s) => s.selection);
  const dimensions = useEditorStore((s) => s.dimensions);
  const referenceCount = useEditorStore((s) => s.references.length);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [opId, setOpId] = useState<string | null>(null);

  // Global keyboard listener
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, toggle]);

  // Focus the input when opening
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    } else {
      setText("");
      setOpId(null);
      setBusy(false);
    }
  }, [open]);

  const mode = inferModeFromContext({ selection, hasReferences: referenceCount > 0 });
  const chatPreviewId = useChatStore((s) =>
    opId ? s.messages.find((m) => m.id === opId) : null,
  );

  const submit = async () => {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setBusy(true);
    try {
      const editor = useEditorStore.getState();
      const source = await compositeBitmap(editor.layers, editor.dimensions);
      const mask = await selectionToMask(editor.selection, editor.dimensions);
      const request: AIGenerateRequest = {
        mode,
        source,
        mask,
        prompt,
        references: editor.references,
        style: "none",
        cfgScale: 7,
        steps: 20,
        variations: 4,
        dimensions: editor.dimensions,
      };
      const chat = useChatStore.getState();
      const id = chat.appendOpProposal({
        role: "assistant",
        kind: "op-proposal",
        request,
        confidence: 0.85,
        via: "cmdk",
        status: "pending",
      });
      setOpId(id);
      await runOp(id, request, 0.85);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className={styles.scrim} onClick={close}>
      <div className={styles.bar} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.modeChip}>{MODE_LABELS[mode]}</span>
          <span className={styles.contextHint}>
            {selection
              ? `selection ${Math.round(selection.w)}×${Math.round(selection.h)}`
              : "no selection · acts on whole canvas"}
          </span>
        </div>
        <textarea
          ref={inputRef}
          className={styles.input}
          rows={2}
          placeholder="What should I do?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              close();
            }
          }}
          disabled={busy && !opId}
        />
        <div className={styles.footer}>
          <span className={styles.kbdHint}>
            <kbd>↵</kbd> generate · <kbd>⇧</kbd>+<kbd>↵</kbd> new line · <kbd>⎋</kbd> close
          </span>
          <span className={styles.spacer} />
          <span className={styles.dims}>
            {dimensions.width}×{dimensions.height}
          </span>
        </div>
        {chatPreviewId && chatPreviewId.role === "assistant" && chatPreviewId.kind === "op-proposal" && (
          <div className={styles.resultArea}>
            <OpProposalCard message={chatPreviewId} />
          </div>
        )}
      </div>
    </div>
  );
}
