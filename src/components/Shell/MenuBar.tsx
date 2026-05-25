import { useState, useRef, useEffect } from "react";
import { useEditorStore, PRESET_DIMS, type CanvasPreset } from "../../state/editorStore";
import { useUIStore } from "../../state/uiStore";
import {
  saveProjectJSON,
  loadProjectJSON,
  clearAutosave,
  exportComposite,
} from "../../state/persistence";
import { canvasToBlob, downloadBlob } from "../../utils/download";
import styles from "./MenuBar.module.css";

interface MenuItem {
  label: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

function useMenus(): Record<string, MenuItem[]> {
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const resetProject = useEditorStore((s) => s.resetProject);
  const openCommandBar = useUIStore((s) => s.openCommandBar);
  const toggleTheme = useEditorStore((s) => s.toggleTheme);
  const selection = useEditorStore((s) => s.selection);

  const handleCmdK = () => {
    if (selection) {
      useUIStore.getState().setAiPanelTab("chat");
      useUIStore.getState().triggerChatInputFocus();
    } else {
      openCommandBar();
    }
  };

  const newProject = (preset: Exclude<CanvasPreset, "custom">) => {
    // renderTick > 0 means the canvas has been mutated since the store was
    // initialized — anything from a stroke, an AI commit, or a layer op.
    const dirty = useEditorStore.getState().renderTick > 0;
    if (dirty && !confirm("Start a new project? Unsaved changes will be lost.")) return;
    clearAutosave();
    resetProject(preset);
  };

  const resizeCanvas = (preset: Exclude<CanvasPreset, "custom">) => {
    const s = useEditorStore.getState();
    const dirty = s.renderTick > 0;
    if (dirty && !confirm("Resize the canvas? All layers will be reset to the new dimensions.")) return;
    resetProject(preset, s.projectName);
  };

  const saveProject = () => {
    const json = saveProjectJSON();
    const blob = new Blob([json], { type: "application/json" });
    const name = useEditorStore.getState().projectName || "untitled";
    downloadBlob(blob, `${name}.paintai.json`);
  };

  const openProject = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        await loadProjectJSON(text);
      } catch (e) {
        alert(`Failed to open project: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    };
    input.click();
  };

  const exportImage = async (format: "png" | "jpg") => {
    const { canvas, filename, mime, quality } = exportComposite(format);
    const blob = await canvasToBlob(canvas, mime, quality);
    downloadBlob(blob, filename);
  };

  return {
    File: [
      { label: "New (1024²)", action: () => newProject("sq-1024") },
      { label: "New 512²", action: () => newProject("sq-512") },
      { label: "New Portrait (1024×1536)", action: () => newProject("portrait-1024x1536") },
      { label: "New Landscape (1536×1024)", action: () => newProject("landscape-1536x1024") },
      { separator: true, label: "" },
      { label: "Open Project…", action: openProject },
      { label: "Save Project (.paintai.json)", action: saveProject },
      { separator: true, label: "" },
      { label: "Export as PNG…", action: () => void exportImage("png") },
      { label: "Export as JPG…", action: () => void exportImage("jpg") },
    ],
    Edit: [
      { label: "Undo", action: undo },
      { label: "Redo", action: redo },
    ],
    View: [
      { label: "Toggle Theme", action: toggleTheme },
    ],
    Image: [
      {
        label: "Canvas Size · 512²",
        action: () => resizeCanvas("sq-512"),
      },
      {
        label: "Canvas Size · 1024²",
        action: () => resizeCanvas("sq-1024"),
      },
      {
        label: "Canvas Size · Portrait",
        action: () => resizeCanvas("portrait-1024x1536"),
      },
      {
        label: "Canvas Size · Landscape",
        action: () => resizeCanvas("landscape-1536x1024"),
      },
    ],
    AI: [
      { label: "Open Cmd+K", action: handleCmdK },
      { label: "Backend Settings…", action: () => useUIStore.getState().setAiPanelTab("settings") },
    ],
    Help: [
      { label: "Keyboard Shortcuts", action: () => alert(KEYBOARD_HELP) },
      { label: "About Painter AI", action: () => alert("Painter AI · v0.1 · A modern AI-native paint app with retro accents.") },
    ],
  };
  // PRESET_DIMS imported only for type-side use; mark as used
  void PRESET_DIMS;
}

const KEYBOARD_HELP = `Keyboard shortcuts:

  ⌘K           Open the command bar
  ⌘Z / ⌘⇧Z     Undo / Redo
  [ / ]        Decrease / increase brush size
  ⎋           Close overlays`;

export function MenuBar() {
  const menus = useMenus();
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <nav className={styles.menubar} ref={ref}>
      {Object.entries(menus).map(([label, items]) => (
        <div key={label} className={styles.item}>
          <button
            className={`${styles.trigger} ${open === label ? styles.active : ""}`}
            onClick={() => setOpen(open === label ? null : label)}
            onMouseEnter={() => open && setOpen(label)}
          >
            {label}
          </button>
          {open === label && (
            <div className={styles.dropdown} role="menu">
              {items.map((it, i) =>
                it.separator ? (
                  <div key={i} className={styles.sep} />
                ) : (
                  <button
                    key={i}
                    className={styles.option}
                    role="menuitem"
                    disabled={it.disabled}
                    onClick={() => {
                      setOpen(null);
                      it.action?.();
                    }}
                  >
                    {it.label}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
