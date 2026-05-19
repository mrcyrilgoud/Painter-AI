import { useEditorStore } from "../../state/editorStore";
import styles from "./CanvasStage.module.css";

interface Props {
  dimensions: { width: number; height: number };
}

export function SelectionOverlay({ dimensions }: Props) {
  const selection = useEditorStore((s) => s.selection);
  if (!selection) return null;
  return (
    <svg
      className={styles.selSvg}
      viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <rect
        x={selection.x}
        y={selection.y}
        width={selection.w}
        height={selection.h}
        fill="var(--accent)"
        fillOpacity={0.05}
      />
      <rect
        x={selection.x}
        y={selection.y}
        width={selection.w}
        height={selection.h}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        strokeDasharray="8 6"
        className={styles.marchingAnts}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
