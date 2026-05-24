# Migration Plan: Replace Codex CLI subprocess with `@openai/codex-sdk`

## Context

The server currently invokes `codex exec --json` as a raw child process, manually parses JSONL
events off stdout, and requires the `codex` binary to be globally installed and on `PATH`. This
drives two features:

- **Chat copilot** (`POST /ai/chat`) — `runCodexCollectText()` called with `CHAT_SYSTEM`
- **Canvas-code image generation** (`codex-canvas` provider) — `runCodexCollectText()` called with
  `DRAW_SYSTEM` / `INPAINT_SYSTEM`

`@openai/codex-sdk` is OpenAI's official TypeScript SDK for the Codex agent. It wraps the same CLI
internally, but eliminates all the manual subprocess plumbing and uses `CODEX_API_KEY` (Codex
subscription) instead of `OPENAI_API_KEY`, so users with a Codex subscription don't need a separate
API key.

**What changes:** 5 files — the Codex runner, config, health route, env example, and package.json.  
**What stays the same:** every caller of `runCodexCollectText()` — the function signature is
identical.

---

## Why `@openai/codex-sdk` over raw OpenAI Responses API

| Concern | `@openai/codex-sdk` | `openai` Responses API |
|---|---|---|
| Auth | `CODEX_API_KEY` (Codex subscription) | `OPENAI_API_KEY` (pay-per-token API) |
| Binary | Bundled as npm dep — no PATH entry needed | No binary needed |
| Subprocess mgmt | SDK handles spawn + JSONL internally | No subprocess at all |
| Typed response | `turn.finalResponse: string` | `response.output_text: string` |
| System prompt | Prepended to `input` string | Native `instructions` field |

The SDK choice keeps compatibility for anyone using a Codex subscription rather than the OpenAI API.

---

## Change 1 — `server/package.json`

Add one dependency. The SDK transitively installs `@openai/codex` (with its platform-specific
native binary), so the binary is available inside `node_modules` with no global install needed.

**Before (`dependencies`):**
```json
{
  "@cursor/sdk": "^1.0.13",
  "@hono/node-server": "^1.13.5",
  "canvas": "^3.2.3",
  "hono": "^4.6.10",
  "pngjs": "^7.0.0",
  "zod": "^4.4.3"
}
```

**After:**
```json
{
  "@cursor/sdk": "^1.0.13",
  "@hono/node-server": "^1.13.5",
  "@openai/codex-sdk": "^0.133.0",
  "canvas": "^3.2.3",
  "hono": "^4.6.10",
  "pngjs": "^7.0.0",
  "zod": "^4.4.3"
}
```

---

## Change 2 — `server/src/codex/runCodex.ts` (full replacement)

This is the core change. The entire 162-line file is replaced with ~40 lines.

**What's removed:**
- `spawn()` call and its argument-building logic
- The `onAbort` / `timedOut` / `timeoutHandle` lifecycle wiring
- The stdout `buffer` + `queue` JSONL parsing loop
- The `wake()` / `resolveNext` event pump
- The `stderr` accumulation for error messages
- The `runCodex` async generator (was only called internally)
- `CodexEvent` type (no longer needed)
- `sandbox` and `cwd` from `RunCodexOptions` (CLI-only concepts)

**Before (`server/src/codex/runCodex.ts`):**
```ts
import { spawn } from "node:child_process";
import { config } from "../config.js";

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
  signal?: AbortSignal;
  model?: string;
  timeoutMs?: number;
}

export async function* runCodex(opts: RunCodexOptions): AsyncIterable<CodexEvent> {
  const args = [
    "exec", "--json", "--skip-git-repo-check", "--ephemeral",
    "--sandbox", opts.sandbox ?? "read-only",
  ];
  if (opts.model) args.push("--model", opts.model);

  const child = spawn(config.codexBin, args, {
    cwd: opts.cwd ?? process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });

  const onAbort = () => { try { child.kill("SIGTERM"); } catch { /* ignore */ } };
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  let timedOut = false;
  const timeoutMs = opts.timeoutMs ?? CODEX_TIMEOUT_MS;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
  }, timeoutMs);

  const fullPrompt = opts.systemPrompt
    ? `${opts.systemPrompt}\n\n---\n\n${opts.prompt}`
    : opts.prompt;
  child.stdin.write(fullPrompt);
  child.stdin.end();

  let stderr = "";
  child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

  let buffer = "";
  const queue: CodexEvent[] = [];
  let done = false;
  let error: Error | null = null;
  let resolveNext: (() => void) | null = null;

  const wake = () => {
    if (resolveNext) { const r = resolveNext; resolveNext = null; r(); }
  };

  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try { queue.push(JSON.parse(line) as CodexEvent); } catch { /* skip non-JSON */ }
    }
    wake();
  });

  child.on("error", (err) => { error = err; done = true; wake(); });
  child.on("close", (code) => {
    if (timedOut && !error) error = new Error(`codex timed out after ${timeoutMs}ms`);
    else if (code !== 0 && !error) error = new Error(`codex exited with code ${code}: ${stderr.slice(0, 500)}`);
    done = true;
    wake();
  });

  try {
    while (true) {
      if (queue.length > 0) { yield queue.shift()!; continue; }
      if (done) { if (error) throw error; return; }
      await new Promise<void>((res) => { resolveNext = res; });
    }
  } finally {
    clearTimeout(timeoutHandle);
    opts.signal?.removeEventListener("abort", onAbort);
    if (!child.killed) child.kill("SIGTERM");
  }
}

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
```

**After (`server/src/codex/runCodex.ts`):**
```ts
import { Codex } from "@openai/codex-sdk";
import { config } from "../config.js";

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
    _client = new Codex({ apiKey: config.codexApiKey });
  }
  return _client;
}

/**
 * Runs a single Codex turn and returns the agent's final response text.
 * A new Thread is created per call (single-turn usage; no shared state needed).
 */
export async function runCodexCollectText(opts: RunCodexOptions): Promise<string> {
  const thread = getClient().startThread({
    model: opts.model ?? config.codexModel,
    sandboxMode: "read-only",   // safe default; always correct for our use cases
    skipGitRepoCheck: true,     // server has no git repo context to offer
  });

  // The SDK has no dedicated system-prompt field; prepend it to the input
  // in the same format the CLI runner used.
  const input = opts.systemPrompt
    ? `${opts.systemPrompt}\n\n---\n\n${opts.prompt}`
    : opts.prompt;

  // Merge caller's AbortSignal with a hard wall-clock timeout.
  const timeoutSignal = AbortSignal.timeout(opts.timeoutMs ?? CODEX_TIMEOUT_MS);
  const signal = opts.signal
    ? AbortSignal.any([opts.signal, timeoutSignal])
    : timeoutSignal;

  const turn = await thread.run(input, { signal });
  return turn.finalResponse;
}
```

---

## Change 3 — `server/src/config.ts`

Remove `codexBin` (binary is bundled by the SDK). Add `codexApiKey` and `codexModel`.

**Before:**
```ts
export const config = {
  codexBin: process.env.CODEX_BIN || "codex",
  geminiBin: process.env.GEMINI_BIN || "gemini",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-pro",
  imageProvider: (process.env.IMAGE_MODEL_PROVIDER || "mock") as
    | "mock" | "openai" | "codex-canvas" | "cursor-canvas" | "gemini-canvas",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  cursorApiKey: process.env.CURSOR_API_KEY || "",
  cursorModel: process.env.CURSOR_MODEL || "composer-latest",
  port: Number(process.env.PORT || 5174),
  imageGenerateConcurrency: Math.max(1, Number(process.env.IMAGE_GENERATE_CONCURRENCY || "1")),
  imageGenerateQueueMax: Math.max(0, Number(process.env.IMAGE_GENERATE_QUEUE_MAX || "2")),
};
```

**After:**
```ts
export const config = {
  // Codex SDK auth — required for chat copilot and codex-canvas provider.
  codexApiKey: process.env.CODEX_API_KEY || "",
  codexModel: process.env.CODEX_MODEL || "codex-mini-latest",
  geminiBin: process.env.GEMINI_BIN || "gemini",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-pro",
  imageProvider: (process.env.IMAGE_MODEL_PROVIDER || "mock") as
    | "mock" | "openai" | "codex-canvas" | "cursor-canvas" | "gemini-canvas",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  cursorApiKey: process.env.CURSOR_API_KEY || "",
  cursorModel: process.env.CURSOR_MODEL || "composer-latest",
  port: Number(process.env.PORT || 5174),
  imageGenerateConcurrency: Math.max(1, Number(process.env.IMAGE_GENERATE_CONCURRENCY || "1")),
  imageGenerateQueueMax: Math.max(0, Number(process.env.IMAGE_GENERATE_QUEUE_MAX || "2")),
};
```

---

## Change 4 — `server/src/routes/health.ts`

Replace the `codexReachable()` async subprocess ping with a synchronous config check.
The response JSON shape is preserved — only `bin` is renamed to `model`.

**Before:**
```ts
import type { Context } from "hono";
import { spawn } from "node:child_process";
import { config } from "../config.js";
import { imageProvider } from "../imageApi/index.js";

async function codexReachable(): Promise<{ reachable: boolean; reason?: string }> {
  return new Promise((resolve) => {
    try {
      const child = spawn(config.codexBin, ["--version"], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      child.stdout.on("data", (d: Buffer) => (out += d.toString()));
      child.on("error", (err) => resolve({ reachable: false, reason: err.message }));
      child.on("close", (code) =>
        resolve(
          code === 0
            ? { reachable: true, reason: out.trim() }
            : { reachable: false, reason: `exit ${code}` },
        ),
      );
    } catch (e) {
      resolve({ reachable: false, reason: (e as Error).message });
    }
  });
}

export async function healthRoute(c: Context) {
  const codex = await codexReachable();
  const img = imageProvider.isReady();
  return c.json({
    status: "ok",
    codex: { bin: config.codexBin, ...codex },
    imageProvider: { name: imageProvider.name, ...img },
  });
}
```

**After:**
```ts
import type { Context } from "hono";
import { config } from "../config.js";
import { imageProvider } from "../imageApi/index.js";

/** Reports whether the Codex SDK is configured (API key present). Synchronous — no spawn. */
function codexConfigured(): { reachable: boolean; reason?: string } {
  return config.codexApiKey
    ? { reachable: true, reason: `model: ${config.codexModel}` }
    : { reachable: false, reason: "CODEX_API_KEY is not set" };
}

export async function healthRoute(c: Context) {
  const codex = codexConfigured();
  const img = imageProvider.isReady();
  return c.json({
    status: "ok",
    codex: { model: config.codexModel, ...codex },
    imageProvider: { name: imageProvider.name, ...img },
  });
}
```

**Health response shape — before vs after:**
```jsonc
// Before
{ "status": "ok", "codex": { "bin": "codex", "reachable": true, "reason": "codex-cli 0.130.0" }, ... }

// After
{ "status": "ok", "codex": { "model": "codex-mini-latest", "reachable": true, "reason": "model: codex-mini-latest" }, ... }
```

---

## Change 5 — `server/.env.example`

**Before:**
```sh
# Painter AI server config

# Path to codex CLI. Defaults to "codex" on PATH.
CODEX_BIN=codex

# Image generation provider. "mock" (default, server-side procedural fill — no API key needed),
# "openai" (calls OpenAI gpt-image-1), "codex-canvas", "cursor-canvas", or "gemini-canvas".
# Clients may override per-request via providerOverride/modelOverride in POST /ai/generate.
IMAGE_MODEL_PROVIDER=mock

# Required only when IMAGE_MODEL_PROVIDER=openai
OPENAI_API_KEY=

# Required only when IMAGE_MODEL_PROVIDER=cursor-canvas
CURSOR_API_KEY=

# Optional when IMAGE_MODEL_PROVIDER=gemini-canvas
GEMINI_BIN=gemini
GEMINI_MODEL=gemini-2.5-pro

# Max concurrent /ai/generate jobs and queued waiters (defaults: 1 active, 2 queued).
IMAGE_GENERATE_CONCURRENCY=1
IMAGE_GENERATE_QUEUE_MAX=2

# Port the proxy binds to (default 5174). Always binds to 127.0.0.1.
PORT=5174
```

**After:**
```sh
# Painter AI server config

# Codex subscription key — required for the chat copilot and the codex-canvas image provider.
# Get yours at https://platform.openai.com/api-keys (Codex subscription, not standard API).
CODEX_API_KEY=

# Optional: override the Codex model. Defaults to codex-mini-latest.
CODEX_MODEL=codex-mini-latest

# Image generation provider. "mock" (default, server-side procedural fill — no API key needed),
# "openai" (calls OpenAI gpt-image-1), "codex-canvas", "cursor-canvas", or "gemini-canvas".
# Clients may override per-request via providerOverride/modelOverride in POST /ai/generate.
IMAGE_MODEL_PROVIDER=mock

# Required only when IMAGE_MODEL_PROVIDER=openai
OPENAI_API_KEY=

# Required only when IMAGE_MODEL_PROVIDER=cursor-canvas
CURSOR_API_KEY=

# Optional when IMAGE_MODEL_PROVIDER=gemini-canvas
GEMINI_BIN=gemini
GEMINI_MODEL=gemini-2.5-pro

# Max concurrent /ai/generate jobs and queued waiters (defaults: 1 active, 2 queued).
IMAGE_GENERATE_CONCURRENCY=1
IMAGE_GENERATE_QUEUE_MAX=2

# Port the proxy binds to (default 5174). Always binds to 127.0.0.1.
PORT=5174
```

---

## Callers — No Changes Required

Both callers of `runCodexCollectText` already pass exactly the options the new interface accepts.
The `sandbox` field they were passing simply becomes a no-op to remove:

**`server/src/routes/chat.ts` (lines 100–104) — unchanged:**
```ts
const rawReply = await runCodexCollectText({
  prompt: userPrompt,
  systemPrompt: CHAT_SYSTEM,
  // sandbox: "read-only" — remove this line; now hardcoded in startThread()
});
```

**`server/src/imageApi/index.ts` (lines 13–22) — unchanged:**
```ts
"codex-canvas": makeCanvasProvider(
  "codex-canvas",
  (prompt, systemPrompt, options) =>
    runCodexCollectText({
      prompt,
      systemPrompt,
      // sandbox: "read-only" — remove this line
      signal: options?.signal,
      model: options?.modelOverride ?? undefined,
    }),
),
```

---

## Files Touched Summary

| File | Change |
|---|---|
| `server/package.json` | Add `@openai/codex-sdk` dependency |
| `server/src/codex/runCodex.ts` | Full replacement — SDK replaces subprocess |
| `server/src/config.ts` | `codexBin` → `codexApiKey` + `codexModel` |
| `server/src/routes/health.ts` | Sync config check replaces async spawn |
| `server/.env.example` | `CODEX_BIN` → `CODEX_API_KEY` + `CODEX_MODEL` |
| `server/src/routes/chat.ts` | Remove `sandbox` field from options object |
| `server/src/imageApi/index.ts` | Remove `sandbox` field from options object |

---

## Verification Steps

```sh
# 1. Install
cd server && npm install
# Confirm in node_modules: @openai/codex-sdk, @openai/codex (with native binary)

# 2. Start server (with CODEX_API_KEY set)
CODEX_API_KEY=sk-... npm run dev

# 3. Health check — should show model, not bin
curl http://localhost:5174/ai/health
# Expected: { "status":"ok", "codex":{ "model":"codex-mini-latest", "reachable":true, ... } }

# 4. Chat copilot
# Open the AI chat panel and send a message — confirm text reply and/or op-proposal

# 5. Canvas-code generation
IMAGE_MODEL_PROVIDER=codex-canvas CODEX_API_KEY=sk-... npm run dev
# Trigger a generation — confirm draw() code is produced and renders to canvas

# 6. Abort signal
# Start a generation, close the modal mid-flight — confirm server process does not hang
```
