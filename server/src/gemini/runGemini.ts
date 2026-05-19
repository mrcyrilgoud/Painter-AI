import { spawn } from "node:child_process";
import { config } from "../config.js";

const GEMINI_TIMEOUT_MS = 120_000;

export interface RunGeminiOptions {
  prompt: string;
  systemPrompt?: string;
  cwd?: string;
  signal?: AbortSignal;
  model?: string;
  timeoutMs?: number;
}

export async function runGeminiCollectText(opts: RunGeminiOptions): Promise<string> {
  const fullPrompt = opts.systemPrompt
    ? `${opts.systemPrompt}\n\n---\n\n${opts.prompt}`
    : opts.prompt;

  const args = ["-p", fullPrompt];
  if (opts.model) args.push("-m", opts.model);

  const child = spawn(config.geminiBin, args, {
    cwd: opts.cwd ?? process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  const onAbort = () => {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  };
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
  child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

  let timedOut = false;
  const timeoutMs = opts.timeoutMs ?? GEMINI_TIMEOUT_MS;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }, timeoutMs);

  try {
    const code: number = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (c) => resolve(c ?? 0));
    });
    if (timedOut) {
      throw new Error(`gemini timed out after ${timeoutMs}ms`);
    }
    if (code !== 0) {
      throw new Error(`gemini exited with code ${code}: ${stderr.slice(0, 500)}`);
    }
    return stdout.trim();
  } finally {
    clearTimeout(timeoutHandle);
    opts.signal?.removeEventListener("abort", onAbort);
    if (!child.killed) child.kill("SIGTERM");
  }
}
