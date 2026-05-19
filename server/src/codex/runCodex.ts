import { spawn } from "node:child_process";
import { config } from "../config.js";

/** Wall-clock timeout for a Codex CLI invocation. Codex can be slow (~20-60s for
 *  canvas-code generation); 120s is a generous ceiling that still bounds hangs. */
const CODEX_TIMEOUT_MS = 120_000;

export interface CodexEvent {
  type: string;
  [key: string]: unknown;
}

export interface RunCodexOptions {
  prompt: string;
  systemPrompt?: string;
  /** Read-only sandbox is the safe default for our use cases. */
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  /** Working dir for the codex process. */
  cwd?: string;
  /** Abort signal — terminates the child on abort. */
  signal?: AbortSignal;
  /** Optional model override. */
  model?: string;
  /** Wall-clock timeout in ms; defaults to 120s. */
  timeoutMs?: number;
}

/**
 * Runs `codex exec --json` with the given prompt and yields each parsed JSONL event.
 * Resolves when the child exits. Throws if the child exits with a non-zero code.
 */
export async function* runCodex(opts: RunCodexOptions): AsyncIterable<CodexEvent> {
  const args = [
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--ephemeral",
    "--sandbox",
    opts.sandbox ?? "read-only",
  ];
  if (opts.model) args.push("--model", opts.model);

  // Pass the prompt via stdin so it can be arbitrarily long.
  const child = spawn(config.codexBin, args, {
    cwd: opts.cwd ?? process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
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

  let timedOut = false;
  const timeoutMs = opts.timeoutMs ?? CODEX_TIMEOUT_MS;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }, timeoutMs);

  // Write the prompt and close stdin
  const fullPrompt = opts.systemPrompt
    ? `${opts.systemPrompt}\n\n---\n\n${opts.prompt}`
    : opts.prompt;
  child.stdin.write(fullPrompt);
  child.stdin.end();

  // Buffer stderr for error reporting
  let stderr = "";
  child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

  let buffer = "";
  const queue: CodexEvent[] = [];
  let done = false;
  let error: Error | null = null;
  let resolveNext: (() => void) | null = null;

  const wake = () => {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r();
    }
  };

  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const evt = JSON.parse(line) as CodexEvent;
        queue.push(evt);
      } catch {
        // Non-JSON line (e.g. "Reading prompt from stdin..."); skip.
      }
    }
    wake();
  });

  child.on("error", (err) => {
    error = err;
    done = true;
    wake();
  });

  child.on("close", (code) => {
    if (timedOut && !error) {
      error = new Error(`codex timed out after ${timeoutMs}ms`);
    } else if (code !== 0 && !error) {
      error = new Error(`codex exited with code ${code}: ${stderr.slice(0, 500)}`);
    }
    done = true;
    wake();
  });

  try {
    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }
      if (done) {
        if (error) throw error;
        return;
      }
      await new Promise<void>((res) => {
        resolveNext = res;
      });
    }
  } finally {
    clearTimeout(timeoutHandle);
    opts.signal?.removeEventListener("abort", onAbort);
    if (!child.killed) child.kill("SIGTERM");
  }
}

/** Convenience: collect the final agent_message text from a codex run. */
export async function runCodexCollectText(opts: RunCodexOptions): Promise<string> {
  let text = "";
  for await (const evt of runCodex(opts)) {
    if (evt.type === "item.completed") {
      const item = (evt as { item?: { type?: string; text?: string } }).item;
      if (item?.type === "agent_message" && typeof item.text === "string") {
        text = item.text;
      }
    }
  }
  return text;
}
