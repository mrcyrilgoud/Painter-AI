import type { AIBackend, Copilot, Segmenter } from "./types";
// import { mockBackend } from "./mockBackend";
// import { mockCopilot } from "./mockCopilot";
import { codexBackend } from "./codex/codexBackend";
import { codexCopilot } from "./codex/codexCopilot";
import { serverSegmenter } from "./serverSegmenter";

// Per-seam backend selection. Defaults to codex (server proxy); mock is disabled.
//   VITE_AI_BACKEND   — "codex" (mock not available)
//   VITE_AI_COPILOT   — "codex" (mock not available)
//
// Segmentation always uses the server at POST /ai/segment.
//
// The "codex" implementations talk to the proxy server (default
// http://127.0.0.1:5174, dev-proxied via /ai/*). Start the server with
// `npm run dev:server` (auto-started by `npm run dev`) and set the
// IMAGE_MODEL_PROVIDER / OPENAI_API_KEY env vars in server/.env to choose
// a real downstream image model.

const backendKind = (import.meta.env.VITE_AI_BACKEND as string | undefined) ?? "codex";
const copilotKind = (import.meta.env.VITE_AI_COPILOT as string | undefined) ?? "codex";

if (backendKind === "mock" || copilotKind === "mock") {
  throw new Error(
    "Client mock backend/copilot is disabled. Use codex and configure IMAGE_MODEL_PROVIDER on the server.",
  );
}

export const aiBackend: AIBackend = codexBackend;
export const segmenter: Segmenter = serverSegmenter;
export const copilot: Copilot = codexCopilot;

export const seamSummary = {
  backend: backendKind,
  segmenter: "server",
  copilot: copilotKind,
};
