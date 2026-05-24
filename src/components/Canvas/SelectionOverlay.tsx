import { useRef, useEffect } from "react";
import { useEditorStore } from "../../state/editorStore";
import type { Selection } from "../../state/editorStore";
import styles from "./CanvasStage.module.css";

interface Props {
  dimensions: { width: number; height: number };
}

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const HANDLE_CURSORS: Record<HandleId, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

const MIN_SIZE = 20;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function applyDelta(
  id: HandleId,
  dx: number,
  dy: number,
  start: Selection,
  dims: { width: number; height: number },
): Selection {
  let { x, y, w, h } = start;

  if (id === "nw" || id === "sw" || id === "w") {
    const newX = clamp(x + dx, 0, x + w - MIN_SIZE);
    w = x + w - newX;
    x = newX;
  }
  if (id === "ne" || id === "se" || id === "e") {
    w = clamp(w + dx, MIN_SIZE, dims.width - x);
  }
  if (id === "nw" || id === "n" || id === "ne") {
    const newY = clamp(y + dy, 0, y + h - MIN_SIZE);
    h = y + h - newY;
    y = newY;
  }
  if (id === "sw" || id === "s" || id === "se") {
    h = clamp(h + dy, MIN_SIZE, dims.height - y);
  }

  return { x, y, w, h };
}

export function SelectionOverlay({ dimensions }: Props) {
  const selection = useEditorStore((s) => s.selection);
  const setSelection = useEditorStore((s) => s.setSelection);
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef<{
    handleId: HandleId;
    startX: number;
    startY: number;
    startSel: Selection;
  } | null>(null);
  // Holds the active drag cleanup so it can be invoked on unmount or re-entry.
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  if (!selection) return null;

  const HANDLE_R = Math.max(14, Math.max(dimensions.width, dimensions.height) * 0.012);

  const clientToCanvas = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (dimensions.width / rect.width),
      y: (clientY - rect.top) * (dimensions.height / rect.height),
    };
  };

  const onHandleDown = (e: React.PointerEvent, handleId: HandleId) => {
    e.stopPropagation();
    e.preventDefault();

    // Evict any in-progress drag before starting a new one (handles rapid re-clicks).
    cleanupRef.current?.();

    const pt = clientToCanvas(e.clientX, e.clientY);
    draggingRef.current = {
      handleId,
      startX: pt.x,
      startY: pt.y,
      startSel: { ...selection },
    };
    document.body.style.cursor = HANDLE_CURSORS[handleId];

    const onMove = (ev: PointerEvent) => {
      const d = draggingRef.current;
      if (!d) return;
      const cur = clientToCanvas(ev.clientX, ev.clientY);
      const next = applyDelta(
        d.handleId,
        cur.x - d.startX,
        cur.y - d.startY,
        d.startSel,
        dimensions,
      );
      setSelection(next);
    };

    const cleanup = () => {
      draggingRef.current = null;
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", cleanup);
      cleanupRef.current = null;
    };

    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", cleanup);
  };

  const { x, y, w, h } = selection;
  const handles: Array<{ id: HandleId; cx: number; cy: number }> = [
    { id: "nw", cx: x,         cy: y         },
    { id: "n",  cx: x + w / 2, cy: y         },
    { id: "ne", cx: x + w,     cy: y         },
    { id: "e",  cx: x + w,     cy: y + h / 2 },
    { id: "se", cx: x + w,     cy: y + h     },
    { id: "s",  cx: x + w / 2, cy: y + h     },
    { id: "sw", cx: x,         cy: y + h     },
    { id: "w",  cx: x,         cy: y + h / 2 },
  ];

  return (
    <svg
      ref={svgRef}
      className={styles.selSvg}
      viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="var(--accent)"
        fillOpacity={0.05}
        style={{ pointerEvents: "none" }}
      />
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        strokeDasharray="8 6"
        className={styles.marchingAnts}
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: "none" }}
      />
      {handles.map(({ id, cx, cy }) => (
        <circle
          key={id}
          cx={cx}
          cy={cy}
          r={HANDLE_R}
          fill="white"
          stroke="var(--accent)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: "all", cursor: HANDLE_CURSORS[id] }}
          onPointerDown={(e) => onHandleDown(e, id)}
        />
      ))}
    </svg>
  );
}
