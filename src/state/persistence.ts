import { useEditorStore, type Layer, type CanvasPreset, PRESET_DIMS } from "./editorStore";
import { useSettingsStore } from "./settingsStore";
import type { AIAutonomy } from "../ai/types";
import { canvasToDataURL, dataUrlToImageBitmap } from "../utils/download";
import { newLayerCanvas } from "../utils/canvas";
import { compositeLayers } from "../utils/composite";

const STORAGE_KEY = "painter-ai-project";
const PROJECT_VERSION = 1;

interface SerializedLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: GlobalCompositeOperation;
  dataUrl: string;
  aiProvenance: Layer["aiProvenance"];
}

export interface SerializedProject {
  version: number;
  name: string;
  dimensions: { width: number; height: number; preset: CanvasPreset };
  aiAutonomy: AIAutonomy;
  layers: SerializedLayer[];
  activeLayerId: string;
}

export function serializeProject(): SerializedProject {
  const s = useEditorStore.getState();
  return {
    version: PROJECT_VERSION,
    name: s.projectName,
    dimensions: s.dimensions,
    aiAutonomy: useSettingsStore.getState().autonomy,
    layers: s.layers.map((l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      blendMode: l.blendMode,
      dataUrl: canvasToDataURL(l.canvas, "image/png"),
      aiProvenance: l.aiProvenance,
    })),
    activeLayerId: s.activeLayerId,
  };
}

export async function deserializeProject(project: SerializedProject) {
  if (project.version !== PROJECT_VERSION) {
    throw new Error(`Unsupported project version ${project.version}`);
  }
  const { width, height } = project.dimensions;
  const layers: Layer[] = [];
  for (const sl of project.layers) {
    const canvas = newLayerCanvas(width, height);
    const ctx = canvas.getContext("2d")!;
    const bm = await dataUrlToImageBitmap(sl.dataUrl);
    ctx.drawImage(bm, 0, 0);
    layers.push({
      id: sl.id,
      name: sl.name,
      visible: sl.visible,
      opacity: sl.opacity,
      blendMode: sl.blendMode,
      canvas,
      aiProvenance: sl.aiProvenance,
    });
  }
  useEditorStore.setState({
    projectName: project.name,
    dimensions: project.dimensions,
    layers,
    activeLayerId: project.activeLayerId,
    selection: null,
    previewBitmap: null,
  });
  useSettingsStore.getState().setAutonomy(project.aiAutonomy);
  useEditorStore.getState().bumpRender();
}

export function saveProjectJSON() {
  const project = serializeProject();
  return JSON.stringify(project, null, 2);
}

export async function loadProjectJSON(text: string) {
  const obj = JSON.parse(text) as SerializedProject;
  await deserializeProject(obj);
}

// ── Autosave ──────────────────────────────────────────────────────────────
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let autosaveSubscribed = false;
const AUTOSAVE_DEBOUNCE = 5000; // 5s after last change

function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      const json = saveProjectJSON();
      localStorage.setItem(STORAGE_KEY, json);
    } catch (e) {
      // localStorage may be full; we just log
      console.warn("[autosave] failed", e);
    }
  }, AUTOSAVE_DEBOUNCE);
}

export function startAutosave() {
  if (autosaveSubscribed) return;
  autosaveSubscribed = true;
  useEditorStore.subscribe((state, prev) => {
    // Trigger on anything that changes paintable state
    if (
      state.renderTick !== prev.renderTick ||
      state.layers !== prev.layers ||
      state.projectName !== prev.projectName ||
      state.dimensions !== prev.dimensions
    ) {
      scheduleAutosave();
    }
  });
  useSettingsStore.subscribe((state, prev) => {
    if (state.autonomy !== prev.autonomy) {
      scheduleAutosave();
    }
  });
}

/**
 * Restore the autosaved project from localStorage. Returns true on success,
 * false if there's nothing to restore or the saved blob is unrecoverable.
 * On parse/deserialize failure, the corrupt blob is cleared so the next boot
 * starts clean rather than throwing again.
 */
export async function loadAutosaved(): Promise<boolean> {
  let text: string | null;
  try {
    text = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    console.warn("[autosave] localStorage read failed", e);
    return false;
  }
  if (!text) return false;
  try {
    await loadProjectJSON(text);
    return true;
  } catch (e) {
    console.warn("[autosave] saved project could not be restored; discarding", e);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* localStorage may be unavailable; ignore */
    }
    return false;
  }
}

export function clearAutosave() {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Export PNG/JPG ────────────────────────────────────────────────────────
export function exportComposite(format: "png" | "jpg"): {
  canvas: HTMLCanvasElement;
  filename: string;
  mime: "image/png" | "image/jpeg";
  quality?: number;
} {
  const s = useEditorStore.getState();
  const canvas = compositeLayers(s.layers, s.dimensions);
  const name = s.projectName || "untitled";
  if (format === "png") {
    return { canvas, filename: `${name}.png`, mime: "image/png" };
  }
  return { canvas, filename: `${name}.jpg`, mime: "image/jpeg", quality: 0.92 };
}

// Re-export preset map for convenience
export { PRESET_DIMS };
