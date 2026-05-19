export function newLayerCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

/** Apply an ImageData snapshot to a canvas, resizing if dimensions changed. */
export function restore(canvas: HTMLCanvasElement, data: ImageData) {
  const ctx = canvas.getContext("2d")!;
  if (data.width !== canvas.width || data.height !== canvas.height) {
    const tmp = document.createElement("canvas");
    tmp.width = data.width;
    tmp.height = data.height;
    tmp.getContext("2d")!.putImageData(data, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tmp, 0, 0);
  } else {
    ctx.putImageData(data, 0, 0);
  }
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
