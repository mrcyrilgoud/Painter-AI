import { describe, it, expect } from "vitest";
import { HistoryStack, type HistoryEntry } from "../src/state/history";

function entry(layerId: string): HistoryEntry {
  // ImageData isn't constructable in jsdom without canvas; the stack doesn't
  // actually read the pixel data so a structural-equivalence stub is fine.
  return {
    kind: "pixels",
    layerId,
    before: { data: new Uint8ClampedArray(4), width: 1, height: 1, colorSpace: "srgb" } as ImageData,
    after: { data: new Uint8ClampedArray(4), width: 1, height: 1, colorSpace: "srgb" } as ImageData,
  };
}

describe("HistoryStack", () => {
  it("starts empty", () => {
    const h = new HistoryStack();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
  });

  it("push then undo returns the entry; second undo returns null", () => {
    const h = new HistoryStack();
    const e = entry("a");
    h.push(e);
    expect(h.canUndo()).toBe(true);
    expect(h.undo()).toBe(e);
    expect(h.canUndo()).toBe(false);
  });

  it("undo + redo round-trip is symmetric", () => {
    const h = new HistoryStack();
    const e1 = entry("a");
    const e2 = entry("b");
    h.push(e1);
    h.push(e2);
    expect(h.undo()).toBe(e2);
    expect(h.redo()).toBe(e2);
    expect(h.undo()).toBe(e2);
    expect(h.undo()).toBe(e1);
    expect(h.canUndo()).toBe(false);
  });

  it("push after undo truncates the redo tail", () => {
    const h = new HistoryStack();
    const a = entry("a");
    const b = entry("b");
    const c = entry("c");
    h.push(a);
    h.push(b);
    h.undo();
    h.push(c);
    expect(h.canRedo()).toBe(false);
    expect(h.undo()).toBe(c);
    expect(h.undo()).toBe(a);
  });

  it("caps history to the configured maximum", () => {
    const h = new HistoryStack();
    for (let i = 0; i < 60; i++) h.push(entry(`l${i}`));
    // Pop everything: should yield exactly the last 50 entries
    const popped: string[] = [];
    while (h.canUndo()) {
      const e = h.undo();
      if (e && e.kind === "pixels") popped.push(e.layerId);
    }
    expect(popped).toHaveLength(50);
    // The newest 50 should remain (l10 .. l59)
    expect(popped[0]).toBe("l59");
    expect(popped[49]).toBe("l10");
  });
});
