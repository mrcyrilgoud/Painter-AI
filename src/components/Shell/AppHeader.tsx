import { useEditorStore } from "../../state/editorStore";
import { MenuBar } from "./MenuBar";
import styles from "./AppHeader.module.css";

export function AppHeader() {
  const projectName = useEditorStore((s) => s.projectName);
  const theme = useEditorStore((s) => s.theme);
  const toggleTheme = useEditorStore((s) => s.toggleTheme);
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.mark}>✦</span>
        <span className={styles.title}>PAINTER AI</span>
        <span className={styles.docName}>{projectName}</span>
      </div>
      <MenuBar />
      <div className={styles.right}>
        <button
          className={styles.iconBtn}
          onClick={toggleTheme}
          title={theme === "light" ? "Switch to dark" : "Switch to light"}
          aria-label="Toggle theme"
        >
          {theme === "light" ? "◐" : "◑"}
        </button>
      </div>
    </header>
  );
}
