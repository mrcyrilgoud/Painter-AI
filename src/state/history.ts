export interface PixelSnapshot {
  kind: "pixels";
  layerId: string;
  before: ImageData;
  after: ImageData;
}

export interface StructuralSnapshot {
  kind: "structural";
  before: { layerIds: string[]; activeLayerId: string };
  after: { layerIds: string[]; activeLayerId: string };
}

export type HistoryEntry = PixelSnapshot | StructuralSnapshot;

const MAX = 50;

export class HistoryStack {
  private entries: HistoryEntry[] = [];
  private cursor = -1; // index of last applied entry

  push(entry: HistoryEntry) {
    if (this.cursor < this.entries.length - 1) {
      this.entries = this.entries.slice(0, this.cursor + 1);
    }
    this.entries.push(entry);
    if (this.entries.length > MAX) this.entries.shift();
    this.cursor = this.entries.length - 1;
  }

  canUndo() {
    return this.cursor >= 0;
  }

  canRedo() {
    return this.cursor < this.entries.length - 1;
  }

  undo(): HistoryEntry | null {
    if (!this.canUndo()) return null;
    const e = this.entries[this.cursor];
    this.cursor--;
    return e;
  }

  redo(): HistoryEntry | null {
    if (!this.canRedo()) return null;
    this.cursor++;
    return this.entries[this.cursor];
  }

  clear() {
    this.entries = [];
    this.cursor = -1;
  }
}
