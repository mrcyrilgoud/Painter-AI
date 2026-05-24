import { describe, it, expect, beforeEach, vi } from "vitest";

// jsdom can't decode a PNG dataURL into a real image. For our deserialize path
// we only need a CanvasImageSource that drawImage() will accept — an empty
// canvas of the right shape is enough to round-trip metadata. Override the
// existing setup.ts polyfill (which only handled the canvas-source case).
(globalThis as { createImageBitmap: typeof createImageBitmap }).createImageBitmap = (async (
  source: unknown,
) => {
  if (source instanceof Blob) {
    return document.createElement("canvas") as unknown as ImageBitmap;
  }
  return source as ImageBitmap;
}) as typeof createImageBitmap;

import { useEditorStore } from "../src/state/editorStore";
import { useSettingsStore } from "../src/state/settingsStore";
import {
  serializeProject,
  deserializeProject,
  saveProjectJSON,
  loadProjectJSON,
  loadAutosaved,
  clearAutosave,
  startAutosave,
} from "../src/state/persistence";

const STORAGE_KEY = "painter-ai-project";

function paintRedDotOnActiveLayer() {
  const s = useEditorStore.getState();
  const layer = s.layers.find((l) => l.id === s.activeLayerId)!;
  const ctx = layer.canvas.getContext("2d")!;
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(2, 2, 4, 4);
  s.bumpRender();
}

describe("persistence — serialize/deserialize round-trip", () => {
  beforeEach(() => {
    useEditorStore.getState().resetProject("sq-512", "RoundTripProject");
    useSettingsStore.setState({ autonomy: "propose" });
    localStorage.clear();
  });

  it("preserves project name, dimensions, autonomy, and layer metadata", async () => {
    const s = useEditorStore.getState();
    useSettingsStore.getState().setAutonomy("auto-confident");
    s.addLayer("Sky");
    s.addLayer("Tree");
    paintRedDotOnActiveLayer();

    const json = saveProjectJSON();
    expect(json).toContain("RoundTripProject");

    // Wipe to a different state then restore
    useEditorStore.getState().resetProject("sq-1024", "WipedProject");
    await loadProjectJSON(json);

    const restored = useEditorStore.getState();
    expect(restored.projectName).toBe("RoundTripProject");
    expect(restored.dimensions.preset).toBe("sq-512");
    expect(restored.dimensions.width).toBe(512);
    expect(useSettingsStore.getState().autonomy).toBe("auto-confident");
    expect(restored.layers.map((l) => l.name)).toEqual(["Background", "Sky", "Tree"]);
  });

  it("deserializeProject rejects mismatched versions", async () => {
    const bad = { ...JSON.parse(saveProjectJSON()), version: 999 };
    await expect(deserializeProject(bad)).rejects.toThrow(/version 999/);
  });
});

describe("persistence — loadAutosaved fallback", () => {
  beforeEach(() => {
    useEditorStore.getState().resetProject("sq-512", "InitialProject");
    localStorage.clear();
  });

  it("returns false and leaves state untouched when nothing is saved", async () => {
    const result = await loadAutosaved();
    expect(result).toBe(false);
    expect(useEditorStore.getState().projectName).toBe("InitialProject");
  });

  it("discards corrupt autosave data instead of leaving the app stuck", async () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await loadAutosaved();

    expect(result).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("restores a previously serialized project", async () => {
    useEditorStore.getState().addLayer("Saved Layer");
    const json = saveProjectJSON();
    localStorage.setItem(STORAGE_KEY, json);

    useEditorStore.getState().resetProject("sq-1024", "Different");

    const ok = await loadAutosaved();
    expect(ok).toBe(true);
    expect(useEditorStore.getState().layers.map((l) => l.name)).toEqual([
      "Background",
      "Saved Layer",
    ]);
  });
});

describe("persistence — autosave", () => {
  // startAutosave installs a module-singleton subscription, so the test for it
  // runs once and the subscription stays installed across the rest of the
  // suite. That's fine — we just need to verify the path works at least once.
  beforeEach(() => {
    useEditorStore.getState().resetProject("sq-512", "AutosaveTest");
    clearAutosave();
  });

  it("writes to localStorage after the debounce window elapses", async () => {
    startAutosave();
    // Use addLayer to guarantee a state change that the autosave subscriber
    // observes (it watches `layers`, among other fields).
    useEditorStore.getState().addLayer("AutosaveTrigger");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    await new Promise((r) => setTimeout(r, 5_400));

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(
      JSON.parse(raw!).layers.some(
        (l: { name: string }) => l.name === "AutosaveTrigger",
      ),
    ).toBe(true);
  }, 10_000);
});

describe("persistence — serializeProject", () => {
  beforeEach(() => {
    useEditorStore.getState().resetProject("sq-512", "Snap");
    localStorage.clear();
  });

  it("captures all current layers", () => {
    const s = useEditorStore.getState();
    s.addLayer("Mid");
    s.addLayer("Top");
    const project = serializeProject();
    expect(project.version).toBe(1);
    expect(project.layers).toHaveLength(3);
    expect(project.layers.every((l) => l.dataUrl.startsWith("data:image/png"))).toBe(true);
  });
});
