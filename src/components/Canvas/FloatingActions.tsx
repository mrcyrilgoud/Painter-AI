import { useEditorStore } from "../../state/editorStore";
import { useUIStore } from "../../state/uiStore";
import { useChatStore } from "../../state/chatStore";
import { compositeBitmap, selectionToMask, selectionToMaskBoundsPx } from "../../utils/composite";
import { buildGenerateRequest, runOp } from "../../ai/runOp";
import type { AIMode, AIGenerateRequest } from "../../ai/types";
import styles from "./CanvasStage.module.css";

interface Props {
  dimensions: { width: number; height: number };
}

interface FloatingAction {
  glyph: string;
  label: string;
  mode?: AIMode;
  promptPrefix?: string;
  confidence?: number;
  onClick?: () => void;
}

const ACTIONS: FloatingAction[] = [
  { glyph: "↖", label: "Pointer", onClick: () => useEditorStore.getState().exitSelectionMode() },
  { glyph: "✨", label: "Generate", mode: "inpaint", promptPrefix: "", confidence: 0.75 },
  { glyph: "🪄", label: "Remove", mode: "inpaint", promptPrefix: "seamless background, blend with surroundings", confidence: 0.9 },
  { glyph: "🔄", label: "Reimagine", mode: "inpaint", promptPrefix: "variation of this region", confidence: 0.7 },
  { glyph: "🎨", label: "Restyle", mode: "restyle", promptPrefix: "restyled", confidence: 0.75 },
];

export function FloatingActions({ dimensions }: Props) {
  const selection = useEditorStore((s) => s.selection);
  const openCommandBar = useUIStore((s) => s.openCommandBar);

  // Last non-dismissed inpaint/restyle op with a meaningful prompt — used for the Re-run button.
  const lastInpaintReq = useChatStore((s) => {
    for (let i = s.messages.length - 1; i >= 0; i--) {
      const m = s.messages[i];
      if (
        m.role === "assistant" &&
        m.kind === "op-proposal" &&
        m.status !== "dismissed" &&
        (m.request.mode === "inpaint" || m.request.mode === "restyle") &&
        m.request.prompt
      ) {
        return m.request as Pick<AIGenerateRequest, "mode" | "prompt" | "style">;
      }
    }
    return null;
  });

  if (!selection) return null;

  const fireAction = async (a: FloatingAction) => {
    if (a.onClick) {
      a.onClick();
      return;
    }
    if (!a.mode) return;
    const editor = useEditorStore.getState();
    const capturedSelection = editor.selection;
    if (!capturedSelection) return;
    const maskBoundsPx = selectionToMaskBoundsPx(capturedSelection, editor.dimensions);
    const source = await compositeBitmap(editor.layers, editor.dimensions);
    const mask = await selectionToMask(capturedSelection, editor.dimensions);
    const prompt = a.promptPrefix ?? "";
    const request = buildGenerateRequest({
      mode: a.mode,
      source,
      mask,
      maskBoundsPx: a.mode === "inpaint" ? maskBoundsPx : undefined,
      prompt: prompt || a.label.toLowerCase(),
    });
    const chat = useChatStore.getState();
    const id = chat.appendOpProposal({
      role: "assistant",
      kind: "op-proposal",
      request,
      confidence: a.confidence ?? 0.75,
      via: "cmdk",
      status: "pending",
    });
    void runOp(id, request, a.confidence ?? 0.75);
  };

  const fireRerun = async () => {
    if (!lastInpaintReq) return;
    const editor = useEditorStore.getState();
    const capturedSelection = editor.selection;
    if (!capturedSelection) return;
    const source = await compositeBitmap(editor.layers, editor.dimensions);
    const mask = await selectionToMask(capturedSelection, editor.dimensions);
    const request = buildGenerateRequest({
      mode: lastInpaintReq.mode,
      source,
      mask,
      maskBoundsPx: lastInpaintReq.mode === "inpaint"
        ? selectionToMaskBoundsPx(capturedSelection, editor.dimensions)
        : undefined,
      prompt: lastInpaintReq.prompt,
    });
    const chat = useChatStore.getState();
    const id = chat.appendOpProposal({
      role: "assistant",
      kind: "op-proposal",
      request,
      confidence: 0.75,
      via: "cmdk",
      status: "pending",
    });
    void runOp(id, request, 0.75);
  };

  // Position the bar above the selection's top edge, centered on its horizontal midpoint.
  // Positions are percentages so they scale with the wrap.
  const leftPct = ((selection.x + selection.w / 2) / dimensions.width) * 100;
  const topPct = (selection.y / dimensions.height) * 100;

  const rerunLabel = lastInpaintReq
    ? lastInpaintReq.prompt.length > 18
      ? lastInpaintReq.prompt.slice(0, 16) + "…"
      : lastInpaintReq.prompt
    : null;

  return (
    <div
      className={styles.floatingActions}
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {ACTIONS.map((a) => (
        <button
          key={a.label}
          className={styles.floatingBtn}
          onClick={() => void fireAction(a)}
          title={a.label}
          aria-label={a.label}
        >
          <span className={styles.faGlyph}>{a.glyph}</span>
          <span className={styles.faLabel}>{a.label}</span>
        </button>
      ))}
      {rerunLabel && (
        <button
          className={styles.floatingBtn}
          onClick={() => void fireRerun()}
          title={`Re-run: "${lastInpaintReq!.prompt}"`}
          aria-label="Re-run last prompt on new area"
        >
          <span className={styles.faGlyph}>↩</span>
          <span className={styles.faLabel}>{rerunLabel}</span>
        </button>
      )}
      <button
        className={`${styles.floatingBtn} ${styles.cmdkBtn}`}
        onClick={openCommandBar}
        title="Open ⌘K for custom prompt"
        aria-label="Custom prompt via ⌘K"
      >
        <span className={styles.faGlyph}>⌘K</span>
      </button>
    </div>
  );
}
