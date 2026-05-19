import { useEditorStore } from "../../state/editorStore";
import styles from "./ColorPalette.module.css";

const PALETTE = [
  "#000000", "#1a1a17", "#5a5852", "#8c8a82", "#b9b4a9", "#ffffff",
  "#c1352b", "#e85f44", "#d97706", "#f3b53d", "#1f9d55", "#3aa757",
  "#0f7a8a", "#3257ff", "#6b8af5", "#8a5cf6", "#b08cff", "#ff3ea5",
  "#ffb6d1", "#fff1d1", "#e9e3d1", "#a3b08a", "#5d7a64", "#3b4c52",
  "#6b4f3b", "#a87049", "#dca37a", "#f0d8b8",
];

export function ColorPalette() {
  const { primaryColor, secondaryColor, setPrimaryColor, setSecondaryColor } = useEditorStore();
  return (
    <div className={styles.strip}>
      <div className={styles.activeBox} title="Primary / secondary">
        <span className={styles.activeBoxSec} style={{ background: secondaryColor }} />
        <span className={styles.activeBoxPri} style={{ background: primaryColor }} />
      </div>
      <div className={styles.divider} />
      <div className={styles.swatches}>
        {PALETTE.map((c) => (
          <button
            key={c}
            className={styles.swatch}
            style={{ background: c }}
            onClick={() => setPrimaryColor(c)}
            onContextMenu={(e) => {
              e.preventDefault();
              setSecondaryColor(c);
            }}
            title={c}
            aria-label={`Color ${c}`}
          />
        ))}
      </div>
      <div className={styles.spacer} />
      <label className={styles.custom}>
        <span>⊕ custom</span>
        <input
          type="color"
          value={primaryColor}
          onChange={(e) => setPrimaryColor(e.target.value)}
        />
      </label>
    </div>
  );
}
