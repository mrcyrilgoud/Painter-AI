import { config } from "../config.js";
import { mockProvider } from "./mockProvider.js";
import { openaiProvider } from "./openaiProvider.js";
import { codexCanvasProvider } from "./codexCanvasProvider.js";
import { cursorCanvasProvider } from "./cursorCanvasProvider.js";
import { geminiCanvasProvider } from "./geminiCanvasProvider.js";
import type { ImageProvider } from "./types.js";

export const imageProvider: ImageProvider =
  config.imageProvider === "openai"
    ? openaiProvider
    : config.imageProvider === "codex-canvas"
      ? codexCanvasProvider
      : config.imageProvider === "cursor-canvas"
        ? cursorCanvasProvider
        : config.imageProvider === "gemini-canvas"
          ? geminiCanvasProvider
          : mockProvider;

export type { ImageProvider } from "./types.js";
