import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore, PRESET_DIMS } from "../src/state/editorStore";

describe("editorStore", () => {
  beforeEach(() => {
    // Reset to a clean square-1024 project for each test
    useEditorStore.getState().resetProject("sq-1024");
  });

  it("starts with a single Background layer", () => {
    const s = useEditorStore.getState();
    expect(s.layers).toHaveLength(1);
    expect(s.layers[0].name).toBe("Background");
    expect(s.activeLayerId).toBe(s.layers[0].id);
  });

  it("addLayer appends a new layer and makes it active", () => {
    const s = useEditorStore.getState();
    const layer = s.addLayer("Sky");
    const after = useEditorStore.getState();
    expect(after.layers).toHaveLength(2);
    expect(after.activeLayerId).toBe(layer.id);
    expect(after.layers[1].name).toBe("Sky");
  });

  it("removeLayer cannot delete the last remaining layer", () => {
    const s = useEditorStore.getState();
    s.removeLayer(s.activeLayerId);
    expect(useEditorStore.getState().layers).toHaveLength(1);
  });

  it("removeLayer picks a new active layer when the active one is removed", () => {
    const s = useEditorStore.getState();
    const newer = s.addLayer("Top");
    s.removeLayer(newer.id);
    const after = useEditorStore.getState();
    expect(after.layers).toHaveLength(1);
    expect(after.activeLayerId).toBe(after.layers[0].id);
  });

  it("toggleLayerVisibility flips the visible flag", () => {
    const s = useEditorStore.getState();
    const id = s.activeLayerId;
    expect(s.layers[0].visible).toBe(true);
    s.toggleLayerVisibility(id);
    expect(useEditorStore.getState().layers[0].visible).toBe(false);
    s.toggleLayerVisibility(id);
    expect(useEditorStore.getState().layers[0].visible).toBe(true);
  });

  it("reorderLayer moves a layer to a new index", () => {
    const s = useEditorStore.getState();
    s.addLayer("Sky");
    s.addLayer("Tree");
    const ids = useEditorStore.getState().layers.map((l) => l.id);
    expect(ids).toHaveLength(3);
    s.reorderLayer(ids[2], 0); // move "Tree" to position 0
    const after = useEditorStore.getState().layers.map((l) => l.name);
    expect(after).toEqual(["Tree", "Background", "Sky"]);
  });

  it("setActiveTool / setBrushSize / setPrimaryColor update the right fields", () => {
    const s = useEditorStore.getState();
    s.setActiveTool("brush");
    s.setBrushSize(12);
    s.setPrimaryColor("#3257ff");
    const after = useEditorStore.getState();
    expect(after.activeTool).toBe("brush");
    expect(after.brushSize).toBe(12);
    expect(after.primaryColor).toBe("#3257ff");
  });

  it("setSelection accepts a Selection and null", () => {
    const s = useEditorStore.getState();
    s.setSelection({ x: 10, y: 10, w: 50, h: 30 });
    expect(useEditorStore.getState().selection).toEqual({ x: 10, y: 10, w: 50, h: 30 });
    s.setSelection(null);
    expect(useEditorStore.getState().selection).toBeNull();
  });

  it("exitSelectionMode clears selection and activates pointer", () => {
    const s = useEditorStore.getState();
    s.setActiveTool("select");
    s.setSelection({ x: 0, y: 0, w: 32, h: 32 });
    s.exitSelectionMode();
    const after = useEditorStore.getState();
    expect(after.selection).toBeNull();
    expect(after.activeTool).toBe("pointer");
  });

  it("resetProject swaps dimensions to the requested preset", () => {
    const s = useEditorStore.getState();
    s.resetProject("portrait-1024x1536");
    const after = useEditorStore.getState();
    expect(after.dimensions.width).toBe(PRESET_DIMS["portrait-1024x1536"].width);
    expect(after.dimensions.height).toBe(PRESET_DIMS["portrait-1024x1536"].height);
    expect(after.dimensions.preset).toBe("portrait-1024x1536");
    expect(after.layers).toHaveLength(1);
  });
});
