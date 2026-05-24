import vm from "node:vm";
import { parentPort, workerData } from "node:worker_threads";
import { createCanvas } from "canvas";

const DRAW_EXEC_TIMEOUT_MS = 5_000;

const { code, width, height } = workerData;

try {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const context = vm.createContext({
    ctx,
    width,
    height,
    Math,
    Date,
    Array,
    Object,
    Number,
    String,
    Boolean,
    JSON,
    Uint8Array,
    Uint8ClampedArray,
    Float32Array,
    Float64Array,
    Int32Array,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
  });
  const script = new vm.Script(`${code}\ndraw(ctx, width, height);`, { filename: "draw.js" });
  script.runInContext(context, { timeout: DRAW_EXEC_TIMEOUT_MS });
  const pixels = ctx.getImageData(0, 0, width, height).data;
  parentPort.postMessage({ pixels }, [pixels.buffer]);
} catch (err) {
  const reason = err instanceof Error ? err.message : String(err);
  parentPort.postMessage({ error: reason });
}
