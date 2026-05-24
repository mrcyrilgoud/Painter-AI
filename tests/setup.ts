/**
 * Vitest setup: polyfill the bits of the canvas/image platform jsdom is missing.
 *
 * jsdom doesn't implement createImageBitmap. Our code only ever passes
 * HTMLCanvasElement to createImageBitmap and then uses the result as a
 * `CanvasImageSource` for `drawImage` — and HTMLCanvasElement is already a
 * valid CanvasImageSource. So the polyfill just returns the source canvas
 * itself, which drawImage handles natively.
 */

if (typeof (globalThis as { createImageBitmap?: unknown }).createImageBitmap !== "function") {
  (globalThis as { createImageBitmap: typeof createImageBitmap }).createImageBitmap = ((
    source: unknown,
  ) => Promise.resolve(source as ImageBitmap)) as typeof createImageBitmap;
}

// Node 22+ may expose a broken partial localStorage when `--localstorage-file`
// is unset. Zustand persist stores need a real Storage API in tests.
class MemoryStorage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  key(i: number): string | null {
    return [...this.store.keys()][i] ?? null;
  }
}

const ls = globalThis.localStorage;
if (!ls || typeof ls.setItem !== "function") {
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    writable: true,
    configurable: true,
  });
}
