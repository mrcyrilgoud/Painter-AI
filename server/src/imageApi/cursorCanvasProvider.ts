import { runCursorCollectText } from "../cursor/runCursor.js";
import { config } from "../config.js";
import { makeCanvasProvider } from "./canvasCodeRenderer.js";

export const cursorCanvasProvider = makeCanvasProvider(
  "cursor-canvas",
  (prompt, systemPrompt) => runCursorCollectText({ prompt, systemPrompt }),
  {
    isReady: () =>
      config.cursorApiKey
        ? { ready: true }
        : { ready: false, reason: "CURSOR_API_KEY is not set" },
  },
);
