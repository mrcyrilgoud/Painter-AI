import { useEffect, useRef } from "react";
import { useEditorStore } from "../../state/editorStore";
import styles from "./CanvasStage.module.css";

export function PreviewLayer() {
  const previewBitmap = useEditorStore((s) => s.previewBitmap);
  const dimensions = useEditorStore((s) => s.dimensions);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = dimensions.width;
    c.height = dimensions.height;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (previewBitmap) {
      const off = previewBitmap.offset;
      ctx.drawImage(previewBitmap.image, off?.x ?? 0, off?.y ?? 0);
    }
  }, [previewBitmap, dimensions]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.preview}
      style={{ display: previewBitmap ? "block" : "none" }}
    />
  );
}
