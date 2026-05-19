import { runCodexCollectText } from "../codex/runCodex.js";
import { makeCanvasProvider } from "./canvasCodeRenderer.js";

export const codexCanvasProvider = makeCanvasProvider(
  "codex-canvas",
  (prompt, systemPrompt) =>
    runCodexCollectText({ prompt, systemPrompt, sandbox: "read-only" }),
);
