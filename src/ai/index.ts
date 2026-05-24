import type { AIBackend, Copilot, Segmenter } from "./types";
import { mockBackend } from "./mockBackend";
import { mockCopilot } from "./mockCopilot";
import { codexBackend } from "./codex/codexBackend";
import { codexCopilot } from "./codex/codexCopilot";
import { serverSegmenter } from "./serverSegmenter";

// Per-seam backend selection. Defaults to mock; flip individual seams via env vars.
//   VITE_AI_BACKEND   — "mock" | "codex"
//   VITE_AI_COPILOT   — "mock" | "codex"
//
// Segmentation always uses the server at POST /ai/segment.
//
// The "codex" implementations talk to the proxy server (default
// http://127.0.0.1:5174, dev-proxied via /ai/*). Start the server with
// `npm run dev:server` (auto-started by `npm run dev`) and set the
// IMAGE_MODEL_PROVIDER / OPENAI_API_KEY env vars in server/.env to choose
// a real downstream image model.

const backendKind = (import.meta.env.VITE_AI_BACKEND as string | undefined) ?? "mock";
const copilotKind = (import.meta.env.VITE_AI_COPILOT as string | undefined) ?? "mock";

export const aiBackend: AIBackend = backendKind === "codex" ? codexBackend : mockBackend;
export const segmenter: Segmenter = serverSegmenter;
export const copilot: Copilot = copilotKind === "codex" ? codexCopilot : mockCopilot;

export const seamSummary = {
  backend: backendKind,
  segmenter: "server",
  copilot: copilotKind,
};
