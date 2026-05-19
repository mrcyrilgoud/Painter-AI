import { create } from "zustand";
import { HistoryStack, type HistoryEntry } from "./history";
import { newLayerCanvas, restore, uid } from "../utils/canvas";
import type { ReferenceImage } from "../ai/types";

export type ToolId =
  | "select"
  | "smart-select"
  | "pencil"
  | "brush"
  | "eraser"
  | "fill"
  | "line"
  | "rect"
  | "ellipse"
  | "text"
  | "ai";

export type CanvasPreset =
  | "sq-512"
  | "sq-1024"
  | "portrait-1024x1536"
  | "landscape-1536x1024"
  | "custom";

export type AIAutonomy = "propose" | "auto-confident" | "agentic";

export const PRESET_DIMS: Record<Exclude<CanvasPreset, "custom">, { width: number; height: number }> = {
  "sq-512": { width: 512, height: 512 },
  "sq-1024": { width: 1024, height: 1024 },
  "portrait-1024x1536": { width: 1024, height: 1536 },
  "landscape-1536x1024": { width: 1536, height: 1024 },
};

export interface AIProvenance {
  opId: string;
  prompt: string;
  mode: "inpaint" | "outpaint" | "newLayer" | "img2img" | "restyle";
  style: string;
  seed: number;
  referenceIds: string[];
  maskDataUrl?: string;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: GlobalCompositeOperation;
  canvas: HTMLCanvasElement;
  aiProvenance: AIProvenance | null;
}

export interface Selection {
  x: number;
  y: number;
  w: number;
  h: number;
}

const history = new HistoryStack();

function freshProject(width: number, height: number): Layer[] {
  const bg = newLayerCanvas(width, height);
  const ctx = bg.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  return [
    {
      id: uid(),
      name: "Background",
      visible: true,
      opacity: 1,
      blendMode: "source-over",
      canvas: bg,
      aiProvenance: null,
    },
  ];
}

export interface EditorState {
  theme: "light" | "dark";
  toggleTheme: () => void;

  projectName: string;
  dimensions: { width: number; height: number; preset: CanvasPreset };
  resetProject: (preset: Exclude<CanvasPreset, "custom">, name?: string) => void;

  layers: Layer[];
  activeLayerId: string;
  setActiveLayer: (id: string) => void;
  addLayer: (name?: string, provenance?: AIProvenance | null) => Layer;
  removeLayer: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  reorderLayer: (id: string, toIndex: number) => void;

  selection: Selection | null;
  setSelection: (s: Selection | null) => void;

  previewBitmap: ImageBitmap | null;
  setPreviewBitmap: (b: ImageBitmap | null) => void;

  references: ReferenceImage[];
  addReference: (ref: ReferenceImage) => void;
  removeReference: (id: string) => void;
  updateReference: (id: string, patch: Partial<ReferenceImage>) => void;

  activeTool: ToolId;
  setActiveTool: (tool: ToolId) => void;

  primaryColor: string;
  secondaryColor: string;
  setPrimaryColor: (color: string) => void;
  setSecondaryColor: (color: string) => void;

  brushSize: number;
  setBrushSize: (size: number) => void;

  aiAutonomy: AIAutonomy;
  setAIAutonomy: (mode: AIAutonomy) => void;

  statusText: string;
  setStatusText: (text: string) => void;

  zoom: number;
  setZoom: (zoom: number) => void;

  // History
  commitPixelChange: (layerId: string, before: ImageData, after: ImageData) => void;
  undo: () => void;
  redo: () => void;

  // Render trigger — components subscribe to this to re-render after canvas mutation
  renderTick: number;
  bumpRender: () => void;
}

const initialDims = PRESET_DIMS["sq-1024"];
const initialLayers = freshProject(initialDims.width, initialDims.height);

const createStore = () => create<EditorState>((set, get) => ({
  theme: "light",
  toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),

  projectName: "untitled",
  dimensions: { ...initialDims, preset: "sq-1024" },
  resetProject: (preset, name = "untitled") => {
    const dims = PRESET_DIMS[preset];
    const layers = freshProject(dims.width, dims.height);
    history.clear();
    set({
      projectName: name,
      dimensions: { ...dims, preset },
      layers,
      activeLayerId: layers[0].id,
      selection: null,
      renderTick: get().renderTick + 1,
    });
  },

  layers: initialLayers,
  activeLayerId: initialLayers[0].id,
  setActiveLayer: (id) => set({ activeLayerId: id }),
  addLayer: (name, provenance = null) => {
    const { dimensions, layers } = get();
    const layer: Layer = {
      id: uid(),
      name: name ?? `Layer ${layers.length + 1}`,
      visible: true,
      opacity: 1,
      blendMode: "source-over",
      canvas: newLayerCanvas(dimensions.width, dimensions.height),
      aiProvenance: provenance,
    };
    set({ layers: [...layers, layer], activeLayerId: layer.id });
    return layer;
  },
  removeLayer: (id) => {
    const { layers, activeLayerId } = get();
    if (layers.length <= 1) return;
    const next = layers.filter((l) => l.id !== id);
    const nextActive = activeLayerId === id ? next[next.length - 1].id : activeLayerId;
    set({ layers: next, activeLayerId: nextActive });
  },
  toggleLayerVisibility: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
    })),
  setLayerOpacity: (id, opacity) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, opacity } : l)),
    })),
  reorderLayer: (id, toIndex) =>
    set((s) => {
      const from = s.layers.findIndex((l) => l.id === id);
      if (from === -1) return s;
      const next = [...s.layers];
      const [moved] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, moved);
      return { layers: next };
    }),

  selection: null,
  setSelection: (s) => set({ selection: s }),

  previewBitmap: null,
  setPreviewBitmap: (b) => set({ previewBitmap: b }),

  references: [],
  addReference: (ref) => set((s) => ({ references: [...s.references, ref] })),
  removeReference: (id) =>
    set((s) => ({ references: s.references.filter((r) => r.id !== id) })),
  updateReference: (id, patch) =>
    set((s) => ({
      references: s.references.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })),

  activeTool: "brush",
  setActiveTool: (tool) => set({ activeTool: tool }),

  primaryColor: "#1a1a17",
  secondaryColor: "#ffffff",
  setPrimaryColor: (color) => set({ primaryColor: color }),
  setSecondaryColor: (color) => set({ secondaryColor: color }),

  brushSize: 6,
  setBrushSize: (size) => set({ brushSize: size }),

  aiAutonomy: "propose",
  setAIAutonomy: (mode) => set({ aiAutonomy: mode }),

  statusText: "Ready",
  setStatusText: (text) => set({ statusText: text }),

  zoom: 1,
  setZoom: (zoom) => set({ zoom }),

  commitPixelChange: (layerId, before, after) => {
    const entry: HistoryEntry = { kind: "pixels", layerId, before, after };
    history.push(entry);
    get().bumpRender();
  },
  undo: () => {
    const e = history.undo();
    if (!e) return;
    applyEntry(get, e, "before");
    get().bumpRender();
  },
  redo: () => {
    const e = history.redo();
    if (!e) return;
    applyEntry(get, e, "after");
    get().bumpRender();
  },

  renderTick: 0,
  bumpRender: () => set((s) => ({ renderTick: s.renderTick + 1 })),
}));

type Store = ReturnType<typeof createStore>;
const g = globalThis as unknown as { __painterEditorStore?: Store };
export const useEditorStore: Store = g.__painterEditorStore ?? (g.__painterEditorStore = createStore());

function applyEntry(get: () => EditorState, entry: HistoryEntry, direction: "before" | "after") {
  if (entry.kind === "pixels") {
    const layer = get().layers.find((l) => l.id === entry.layerId);
    if (!layer) return;
    restore(layer.canvas, direction === "before" ? entry.before : entry.after);
  }
}
