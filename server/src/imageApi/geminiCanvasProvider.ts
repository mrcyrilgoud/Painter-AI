import { runGeminiCollectText } from "../gemini/runGemini.js";
import { config } from "../config.js";
import { makeCanvasProvider } from "./canvasCodeRenderer.js";

export const geminiCanvasProvider = makeCanvasProvider(
  "gemini-canvas",
  (prompt, systemPrompt) =>
    runGeminiCollectText({ prompt, systemPrompt, model: config.geminiModel }),
);
