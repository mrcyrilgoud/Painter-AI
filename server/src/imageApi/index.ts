import { config } from "../config.js";
import { runCodexCollectText, codexAuthAvailable } from "../codex/runCodex.js";
import { runCursorCollectText } from "../cursor/runCursor.js";
import { runGeminiCollectText } from "../gemini/runGemini.js";
import { mockProvider } from "./mockProvider.js";
import { openaiProvider } from "./openaiProvider.js";
import { makeCanvasProvider } from "./canvasCodeRenderer.js";
import type { ImageProvider } from "./types.js";

const providers = {
  mock: mockProvider,
  openai: openaiProvider,
  "codex-canvas": makeCanvasProvider(
    "codex-canvas",
    (prompt, systemPrompt, options) =>
      runCodexCollectText({
        prompt,
        systemPrompt,
        signal: options?.signal,
        model: options?.modelOverride ?? undefined,
      }),
    {
      isReady: () =>
        codexAuthAvailable()
          ? { ready: true }
          : { ready: false, reason: "no CODEX_API_KEY and no ~/.codex/auth.json (run `codex login`)" },
    },
  ),
  "cursor-canvas": makeCanvasProvider(
    "cursor-canvas",
    (prompt, systemPrompt, options) =>
      runCursorCollectText({
        prompt,
        systemPrompt,
        signal: options?.signal,
        model: options?.modelOverride ?? config.cursorModel,
      }),
    {
      isReady: () =>
        config.cursorApiKey
          ? { ready: true }
          : { ready: false, reason: "CURSOR_API_KEY is not set" },
    },
  ),
  "gemini-canvas": makeCanvasProvider(
    "gemini-canvas",
    (prompt, systemPrompt, options) =>
      runGeminiCollectText({
        prompt,
        systemPrompt,
        model: options?.modelOverride ?? config.geminiModel,
        signal: options?.signal,
      }),
  ),
} as const;

export type ImageProviderId = keyof typeof providers;

export function pickProvider(override?: ImageProviderId | null): ImageProvider {
  const id =
    override && override in providers ? override : (config.imageProvider as ImageProviderId);
  return providers[id in providers ? id : "mock"];
}

export function defaultProviderModel(providerId: ImageProviderId): string {
  switch (providerId) {
    case "openai":
      return "gpt-image-1";
    case "cursor-canvas":
      return config.cursorModel;
    case "gemini-canvas":
      return config.geminiModel;
    case "codex-canvas":
      return config.codexModel;
    default:
      return "n/a";
  }
}

/** Default provider from server config (backward compat for health). */
export const imageProvider = pickProvider(null);

export type { ImageProvider } from "./types.js";
