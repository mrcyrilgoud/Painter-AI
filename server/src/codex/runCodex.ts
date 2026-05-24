import { Codex } from "@openai/codex-sdk";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { config } from "../config.js";

/** True when the user has either a Codex API key OR a local `codex login` session
 *  (the same auth scheme that Conductor, T3Code, etc. use). */
export function codexAuthAvailable(): boolean {
  return !!config.codexApiKey || existsSync(join(homedir(), ".codex", "auth.json"));
}

/** Wall-clock timeout for a Codex SDK turn. Codex can be slow (~20-60s for
 *  canvas-code generation); 120s is a generous ceiling that still bounds hangs. */
const CODEX_TIMEOUT_MS = 120_000;

export interface RunCodexOptions {
  prompt: string;
  systemPrompt?: string;
  /** Abort signal — cancels the in-flight turn. */
  signal?: AbortSignal;
  /** Optional model override (e.g. "codex-mini-latest"). Falls back to config.codexModel. */
  model?: string;
  /** Wall-clock timeout in ms; defaults to 120s. */
  timeoutMs?: number;
}

/** Lazy singleton — reuse one Codex client across all calls in this process. */
let _client: Codex | null = null;
function getClient(): Codex {
  if (!_client) {
    // When CODEX_API_KEY is unset, omit apiKey entirely so the underlying CLI
    // falls back to local auth (~/.codex/auth.json from `codex login`) —
    // this is how Codex subscription / ChatGPT auth works.
    _client = new Codex(config.codexApiKey ? { apiKey: config.codexApiKey } : {});
  }
  return _client;
}

/**
 * Runs a single Codex turn and returns the agent's final response text.
 * A new Thread is created per call (single-turn usage; no shared state needed).
 */
export async function runCodexCollectText(opts: RunCodexOptions): Promise<string> {
  // Only pass `model` when one is explicitly configured — otherwise let the SDK
  // pick a default compatible with the active auth mode (ChatGPT vs API key).
  const model = opts.model || config.codexModel || undefined;
  const thread = getClient().startThread({
    ...(model ? { model } : {}),
    sandboxMode: "read-only",
    skipGitRepoCheck: true,
  });

  const input = opts.systemPrompt
    ? `${opts.systemPrompt}\n\n---\n\n${opts.prompt}`
    : opts.prompt;

  const timeoutSignal = AbortSignal.timeout(opts.timeoutMs ?? CODEX_TIMEOUT_MS);
  const signal = opts.signal
    ? AbortSignal.any([opts.signal, timeoutSignal])
    : timeoutSignal;

  const turn = await thread.run(input, { signal });
  return turn.finalResponse;
}
