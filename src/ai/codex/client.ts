// The dev server proxies /ai/* to http://127.0.0.1:5174 (see vite.config.ts).
const BASE = "/ai";

// 130 s > server's 120 s wall clock so server errors win the race, but the
// client never hangs longer than this on its own.
const DEFAULT_TIMEOUT_MS = 130_000;

export class TimeoutError extends Error {
  constructor(message = "Generation timed out — try a smaller area or simpler prompt") {
    super(message);
    this.name = "TimeoutError";
  }
}

interface MergedSignal {
  signal: AbortSignal | undefined;
  dispose: () => void;
}

function mergeSignals(signals: (AbortSignal | undefined)[]): MergedSignal {
  const real = signals.filter((s): s is AbortSignal => !!s);
  if (real.length === 0) return { signal: undefined, dispose: () => {} };
  if (real.length === 1) return { signal: real[0], dispose: () => {} };
  const Any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof Any === "function") return { signal: Any(real), dispose: () => {} };
  // Manual merge — detach listeners on dispose() to prevent leaks on long-lived
  // user signals that outlive many short-lived timeout signals.
  const ctrl = new AbortController();
  const attached: { sig: AbortSignal; handler: () => void }[] = [];
  for (const s of real) {
    if (s.aborted) {
      ctrl.abort(s.reason);
      break;
    }
    const handler = () => ctrl.abort(s.reason);
    s.addEventListener("abort", handler, { once: true });
    attached.push({ sig: s, handler });
  }
  return {
    signal: ctrl.signal,
    dispose: () => {
      for (const { sig, handler } of attached) sig.removeEventListener("abort", handler);
    },
  };
}

/** Distinguish wall-clock timeout from an explicit user cancel. */
export function fetchAbortKind(
  timeoutSignal: AbortSignal,
  userSignal?: AbortSignal,
): "timeout" | "user-cancel" | null {
  if (timeoutSignal.aborted && !userSignal?.aborted) return "timeout";
  if (userSignal?.aborted) return "user-cancel";
  return null;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ response: Response; dispose: () => void }> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const merged = mergeSignals([timeoutSignal, opts.signal]);
  try {
    const response = await fetch(url, { ...init, signal: merged.signal });
    return { response, dispose: merged.dispose };
  } catch (err) {
    merged.dispose();
    // AbortSignal.timeout() aborts with a DOMException named "TimeoutError",
    // not "AbortError" — use signal state instead of err.name.
    if (fetchAbortKind(timeoutSignal, opts.signal) === "timeout") {
      throw new TimeoutError();
    }
    throw err;
  }
}

export class CodexClient {
  async health() {
    const r = await fetch(`${BASE}/health`);
    return r.json();
  }

  async status() {
    const r = await fetch(`${BASE}/status`);
    if (!r.ok) throw new Error(`status failed ${r.status}: ${await r.text()}`);
    return r.json();
  }

  async generate(
    body: object,
    opts: { signal?: AbortSignal } = {},
  ): Promise<{
    variationsBase64: string[];
    seeds: number[];
    boundsPx?: { x: number; y: number; w: number; h: number };
    outputKind?: "full-canvas" | "inpaint-region";
  }> {
    const { response, dispose } = await fetchWithTimeout(
      `${BASE}/generate`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      { signal: opts.signal },
    );
    try {
      if (!response.ok) throw new Error(`generate failed ${response.status}: ${await response.text()}`);
      return await response.json();
    } finally {
      dispose();
    }
  }

  async segment(
    body: object,
    opts: { signal?: AbortSignal } = {},
  ): Promise<{ maskPngBase64: string; warning?: "no_color_match" | "empty_mask"; hint?: string }> {
    const { response, dispose } = await fetchWithTimeout(
      `${BASE}/segment`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      { signal: opts.signal, timeoutMs: 60_000 },
    );
    try {
      if (!response.ok) throw new Error(`segment failed ${response.status}: ${await response.text()}`);
      return await response.json();
    } finally {
      dispose();
    }
  }

  async *chat(body: object, opts: { signal?: AbortSignal } = {}): AsyncIterable<unknown> {
    const { response, dispose } = await fetchWithTimeout(
      `${BASE}/chat`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      { signal: opts.signal },
    );
    try {
      if (!response.ok || !response.body) throw new Error(`chat failed ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE events are separated by double-newlines; each event has `data: ...` lines.
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          const payload = dataLine.replace(/^data:\s*/, "");
          try {
            yield JSON.parse(payload);
          } catch {
            // ignore malformed
          }
        }
      }
    } finally {
      dispose();
    }
  }
}

export const codexClient = new CodexClient();

export async function base64PngToImageBitmap(b64: string): Promise<ImageBitmap> {
  const raw = b64.replace(/^data:[^;]+;base64,/, "");
  // atob → binary string → Uint8Array → Blob → ImageBitmap
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  return createImageBitmap(new Blob([bytes], { type: "image/png" }));
}
