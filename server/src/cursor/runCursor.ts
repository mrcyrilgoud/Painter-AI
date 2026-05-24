import { Agent } from "@cursor/sdk";
import { config } from "../config.js";
import { abortError } from "../abort.js";

const CURSOR_TIMEOUT_MS = 120_000;

export interface RunCursorOptions {
  prompt: string;
  systemPrompt?: string;
  /** Override the configured model id (e.g. "composer-latest", "auto"). */
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * One-shot text generation via the Cursor Agent SDK.
 * Returns the run's final result text, or empty string if the run completed without one.
 */
export async function runCursorCollectText(opts: RunCursorOptions): Promise<string> {
  if (!config.cursorApiKey) {
    throw new Error("CURSOR_API_KEY is not set");
  }

  if (opts.signal?.aborted) {
    throw abortError();
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

  let abortPromise: Promise<never> | null = null;
  let onAbort: (() => void) | null = null;
  if (opts.signal) {
    abortPromise = new Promise<never>((_, reject) => {
      onAbort = () => reject(abortError());
      opts.signal!.addEventListener("abort", onAbort, { once: true });
    });
  }

  let result: Awaited<ReturnType<typeof Agent.prompt>>;
  try {
    const racers: Promise<unknown>[] = [
      Agent.prompt(fullPrompt, {
        apiKey: config.cursorApiKey,
        model: { id: opts.model ?? config.cursorModel },
      }),
      timeoutPromise,
    ];
    if (abortPromise) racers.push(abortPromise);
    result = (await Promise.race(racers)) as Awaited<ReturnType<typeof Agent.prompt>>;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (opts.signal && onAbort) opts.signal.removeEventListener("abort", onAbort);
  }

  if (result.status !== "finished") {
    throw new Error(`Cursor run ${result.id} ended with status: ${result.status}`);
  }

  return result.result ?? "";
}
