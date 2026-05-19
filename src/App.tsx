import { useEffect } from "react";
import { AppHeader } from "./components/Shell/AppHeader";
import { Toolbox } from "./components/Toolbox/Toolbox";
import { CanvasStage } from "./components/Canvas/CanvasStage";
import { AIPanel } from "./components/AIPanel/AIPanel";
import { ColorPalette } from "./components/Palette/ColorPalette";
import { StatusBar } from "./components/Shell/StatusBar";
import { CommandBar } from "./components/CommandBar/CommandBar";
import { useEditorStore } from "./state/editorStore";
import { startAutosave, loadAutosaved } from "./state/persistence";
import styles from "./App.module.css";

export function App() {
  const theme = useEditorStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadAutosaved();
      if (cancelled) return;
      startAutosave();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.app}>
      <AppHeader />
      <div className={styles.body}>
        <Toolbox />
        <CanvasStage />
        <AIPanel />
      </div>
      <ColorPalette />
      <StatusBar />
      <CommandBar />
    </div>
  );
}
