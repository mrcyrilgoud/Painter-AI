export const config = {
  codexApiKey: process.env.CODEX_API_KEY || "",
  // Empty default — let the Codex SDK pick a model compatible with the auth mode
  // (ChatGPT subscriptions and API keys support different model sets).
  codexModel: process.env.CODEX_MODEL || "",
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
  imageGenerateConcurrency: Math.max(1, Number(process.env.IMAGE_GENERATE_CONCURRENCY || "1")),
  imageGenerateQueueMax: Math.max(0, Number(process.env.IMAGE_GENERATE_QUEUE_MAX || "2")),
};
