import { config } from "../config.js";
import { GenerateQueue } from "./generateQueue.js";

export const generateQueue = new GenerateQueue(
  config.imageGenerateConcurrency,
  config.imageGenerateQueueMax,
);

export function generateQueueSnapshot() {
  return generateQueue.snapshot();
}
