import { useEditorStore } from "../../state/editorStore";
import { useUIStore } from "../../state/uiStore";
import styles from "./StatusBar.module.css";

export function StatusBar() {
  const statusText = useEditorStore((s) => s.statusText);
  const dimensions = useEditorStore((s) => s.dimensions);
  const zoom = useEditorStore((s) => s.zoom);
  const openCommandBar = useUIStore((s) => s.openCommandBar);
  return (
    <footer className={styles.bar}>
      <span className={styles.text}>{statusText}</span>
      <span className={styles.spacer} />
      <span className={styles.cell}>
        {dimensions.width}×{dimensions.height}
      </span>
      <span className={styles.cell}>{Math.round(zoom * 100)}%</span>
      <button className={styles.kbd} onClick={openCommandBar} title="Open command bar (⌘K)">
        ⌘K
      </button>
    </footer>
  );
}
