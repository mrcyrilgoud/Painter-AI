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
