import { useEditorStore } from "../../state/editorStore";
import { useUIStore } from "../../state/uiStore";
import { useChatStore } from "../../state/chatStore";
import { compositeBitmap, selectionToMask } from "../../utils/composite";
import { runOp } from "../../ai/runOp";
import type { AIGenerateRequest, AIMode } from "../../ai/types";
import styles from "./CanvasStage.module.css";

interface Props {
  dimensions: { width: number; height: number };
}

interface FloatingAction {
  glyph: string;
  label: string;
  mode: AIMode;
  promptPrefix: string;
  confidence: number;
}

const ACTIONS: FloatingAction[] = [
  { glyph: "✨", label: "Generate", mode: "inpaint", promptPrefix: "", confidence: 0.75 },
  { glyph: "🪄", label: "Remove", mode: "inpaint", promptPrefix: "seamless background, blend with surroundings", confidence: 0.9 },
  { glyph: "🔄", label: "Reimagine", mode: "inpaint", promptPrefix: "variation of this region", confidence: 0.7 },
  { glyph: "🎨", label: "Restyle", mode: "restyle", promptPrefix: "restyled", confidence: 0.75 },
];

export function FloatingActions({ dimensions }: Props) {
  const selection = useEditorStore((s) => s.selection);
  const openCommandBar = useUIStore((s) => s.openCommandBar);
  if (!selection) return null;

  const fireAction = async (a: FloatingAction) => {
    const editor = useEditorStore.getState();
    const source = await compositeBitmap(editor.layers, editor.dimensions);
    const mask = await selectionToMask(editor.selection, editor.dimensions);
    const prompt = a.promptPrefix;
    const request: AIGenerateRequest = {
      mode: a.mode,
      source,
      mask,
      prompt: prompt || a.label.toLowerCase(),
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
      confidence: a.confidence,
      via: "cmdk",
      status: "pending",
    });
    void runOp(id, request, a.confidence);
  };

  // Position the bar above the selection's top edge, centered on its horizontal midpoint.
  // Positions are percentages so they scale with the wrap.
  const leftPct = ((selection.x + selection.w / 2) / dimensions.width) * 100;
  const topPct = (selection.y / dimensions.height) * 100;

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
