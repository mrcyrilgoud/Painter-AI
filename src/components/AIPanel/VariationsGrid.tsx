import { useEffect, useRef } from "react";
import type { AIVariation } from "../../ai/types";
import { useEditorStore } from "../../state/editorStore";
import styles from "./AIPanel.module.css";

interface Props {
  variations: AIVariation[];
  status: "pending" | "generating" | "ready" | "committed" | "dismissed";
  progress?: number;
  committedIndex?: number;
  onCommit: (index: number) => void;
}

export function VariationsGrid({ variations, status, progress, committedIndex, onCommit }: Props) {
  if (status === "generating" || status === "pending") {
    return (
      <div className={styles.varGrid}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${styles.varTile} ${styles.varLoading}`}>
            <div className={styles.varLoadingShimmer} />
          </div>
        ))}
        {typeof progress === "number" && (
          <div className={styles.varProgress}>
            <div className={styles.varProgressBar} style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    );
  }
  return (
    <div className={styles.varGrid}>
      {variations.map((v, i) => (
        <VariationTile
          key={i}
          variation={v}
          index={i}
          isCommitted={committedIndex === i}
          disabled={status === "committed" || status === "dismissed"}
          onCommit={onCommit}
        />
      ))}
    </div>
  );
}

const THUMB_PX = 160;

function VariationTile({
  variation,
  index,
  isCommitted,
  disabled,
  onCommit,
}: {
  variation: AIVariation;
  index: number;
  isCommitted: boolean;
  disabled: boolean;
  onCommit: (i: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setPreviewBitmap = useEditorStore((s) => s.setPreviewBitmap);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ar = variation.image.width / variation.image.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (ar >= 1) {
      c.width = Math.round(THUMB_PX * dpr);
      c.height = Math.round((THUMB_PX / ar) * dpr);
    } else {
      c.width = Math.round(THUMB_PX * ar * dpr);
      c.height = Math.round(THUMB_PX * dpr);
    }
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(variation.image, 0, 0, c.width, c.height);
  }, [variation]);

  const onEnter = () => {
    if (!disabled) setPreviewBitmap(variation.image);
  };
  const onLeave = () => {
    setPreviewBitmap(null);
  };
  const onClick = () => {
    if (disabled) return;
    setPreviewBitmap(null);
    onCommit(index);
  };

  return (
    <button
      className={`${styles.varTile} ${isCommitted ? styles.varCommitted : ""}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
      disabled={disabled && !isCommitted}
      title={isCommitted ? "Committed" : "Click to commit · hover to preview"}
    >
      <canvas ref={canvasRef} className={styles.varCanvas} />
      {isCommitted && <span className={styles.varBadge}>✓</span>}
    </button>
  );
}
