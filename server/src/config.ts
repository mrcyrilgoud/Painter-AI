export const config = {
  codexBin: process.env.CODEX_BIN || "codex",
  geminiBin: process.env.GEMINI_BIN || "gemini",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-pro",
  imageProvider: (process.env.IMAGE_MODEL_PROVIDER || "mock") as
    | "mock"
    | "openai"
    | "codex-canvas"
    | "cursor-canvas"
    | "gemini-canvas",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  cursorApiKey: process.env.CURSOR_API_KEY || "",
  cursorModel: process.env.CURSOR_MODEL || "composer-latest",
  port: Number(process.env.PORT || 5174),
};
