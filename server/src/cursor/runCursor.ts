import { Agent } from "@cursor/sdk";
import { config } from "../config.js";

const CURSOR_TIMEOUT_MS = 120_000;

export interface RunCursorOptions {
  prompt: string;
  systemPrompt?: string;
  /** Override the configured model id (e.g. "composer-latest", "auto"). */
  model?: string;
  timeoutMs?: number;
}

/**
 * One-shot text generation via the Cursor Agent SDK.
 * Returns the run's final result text, or empty string if the run completed without one.
 */
export async function runCursorCollectText(opts: RunCursorOptions): Promise<string> {
  if (!config.cursorApiKey) {
    throw new Error("CURSOR_API_KEY is not set");
  }

  const fullPrompt = opts.systemPrompt
    ? `${opts.systemPrompt}\n\n---\n\n${opts.prompt}`
    : opts.prompt;

  const timeoutMs = opts.timeoutMs ?? CURSOR_TIMEOUT_MS;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`cursor agent timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  let result: Awaited<ReturnType<typeof Agent.prompt>>;
  try {
    result = await Promise.race([
      Agent.prompt(fullPrompt, {
        apiKey: config.cursorApiKey,
        model: { id: opts.model ?? config.cursorModel },
      }),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }

  if (result.status !== "finished") {
    throw new Error(`Cursor run ${result.id} ended with status: ${result.status}`);
  }

  return result.result ?? "";
}
