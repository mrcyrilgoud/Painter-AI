import { useEffect, useRef } from "react";
import { useChatStore, type ChatMessage } from "../../state/chatStore";
import { useEditorStore } from "../../state/editorStore";
import styles from "./AIPanel.module.css";

const MODE_LABELS: Record<string, string> = {
  inpaint: "Inpaint",
  outpaint: "Outpaint",
  newLayer: "New Layer",
  img2img: "Img2Img",
  restyle: "Restyle",
};

export function HistoryTab() {
  const messages = useChatStore((s) => s.messages);
  const committed = messages.filter(
    (m): m is Extract<ChatMessage, { kind: "op-proposal" }> =>
      m.role === "assistant" && m.kind === "op-proposal" && m.status === "committed",
  );

  if (committed.length === 0) {
    return <div className={styles.emptyTab}>No committed AI ops yet.</div>;
  }

  // Reverse for newest-first
  const ordered = [...committed].reverse();
  return (
    <div className={styles.historyList}>
      {ordered.map((m) => (
        <HistoryRow key={m.id} message={m} />
      ))}
    </div>
  );
}

function HistoryRow({ message }: { message: Extract<ChatMessage, { kind: "op-proposal" }> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer);
  const layers = useEditorStore((s) => s.layers);

  const variation =
    typeof message.committedVariationIndex === "number"
      ? message.variations?.[message.committedVariationIndex]
      : undefined;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !variation) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const target = 48;
    const ar = variation.image.width / variation.image.height;
    if (ar >= 1) {
      c.width = Math.round(target * dpr);
      c.height = Math.round((target / ar) * dpr);
    } else {
      c.width = Math.round(target * ar * dpr);
      c.height = Math.round(target * dpr);
    }
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(variation.image, 0, 0, c.width, c.height);
  }, [variation]);

  const associatedLayer = layers.find((l) => l.aiProvenance?.opId === message.id);

  return (
    <button
      className={styles.historyRow}
      onClick={() => associatedLayer && setActiveLayer(associatedLayer.id)}
      disabled={!associatedLayer}
      title={associatedLayer ? "Jump to layer" : "Layer deleted"}
    >
      <canvas ref={canvasRef} className={styles.historyThumb} />
      <div className={styles.historyMeta}>
        <span className={styles.historyPrompt}>{message.request.prompt}</span>
        <span className={styles.historySub}>
          <span className={styles.historyMode}>{MODE_LABELS[message.request.mode]}</span>
          {message.request.style !== "none" && <span> · {message.request.style}</span>}
          {message.via === "cmdk" && <span> · ⌘K</span>}
          <span> · {relTime(message.timestamp)}</span>
        </span>
      </div>
    </button>
  );
}

function relTime(t: number) {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
