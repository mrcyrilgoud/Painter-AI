import { useEditorStore, type ToolId } from "../../state/editorStore";
import styles from "./Toolbox.module.css";

interface ToolDef {
  id: ToolId;
  label: string;
  glyph: string;
}

const TOOLS: ToolDef[] = [
  { id: "select", label: "Select", glyph: "▱" },
  { id: "smart-select", label: "Smart Select", glyph: "⌖" },
  { id: "pencil", label: "Pencil", glyph: "✎" },
  { id: "brush", label: "Brush", glyph: "✒" },
  { id: "eraser", label: "Eraser", glyph: "▢" },
  { id: "fill", label: "Fill", glyph: "⊙" },
  { id: "line", label: "Line", glyph: "╱" },
  { id: "rect", label: "Rectangle", glyph: "▭" },
  { id: "ellipse", label: "Ellipse", glyph: "◯" },
  { id: "text", label: "Text", glyph: "A" },
  { id: "ai", label: "AI Brush", glyph: "✦" },
];

const SIZES = [2, 4, 8, 16];

export function Toolbox() {
  const { activeTool, setActiveTool, brushSize, setBrushSize, primaryColor, secondaryColor } =
    useEditorStore();

  return (
    <aside className={styles.toolbox}>
      <div className={styles.tools}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`${styles.tool} ${activeTool === t.id ? styles.active : ""} ${
              t.id === "ai" ? styles.aiTool : ""
            }`}
            onClick={() => setActiveTool(t.id)}
            title={t.label}
            aria-label={t.label}
          >
            <span className={styles.glyph}>{t.glyph}</span>
          </button>
        ))}
      </div>

      <div className={styles.divider} />

      <div className={styles.sizes}>
        {SIZES.map((s) => (
          <button
            key={s}
            className={`${styles.sizeBtn} ${brushSize === s ? styles.sizeActive : ""}`}
            onClick={() => setBrushSize(s)}
            aria-label={`Size ${s}`}
            title={`Size ${s}`}
          >
            <span
              className={styles.sizeDot}
              style={{ width: Math.min(s, 20), height: Math.min(s, 20) }}
            />
          </button>
        ))}
      </div>

      <div className={styles.divider} />

      <div className={styles.swatches} title="Primary / secondary color">
        <span
          className={`${styles.swatch} ${styles.secondarySwatch}`}
          style={{ background: secondaryColor }}
        />
        <span
          className={`${styles.swatch} ${styles.primarySwatch}`}
          style={{ background: primaryColor }}
        />
      </div>
    </aside>
  );
}
