// The dev server proxies /ai/* to http://127.0.0.1:5174 (see vite.config.ts).
const BASE = "/ai";

export class CodexClient {
  async health() {
    const r = await fetch(`${BASE}/health`);
    return r.json();
  }

  async generate(body: object): Promise<{ variationsBase64: string[]; seeds: number[] }> {
    const r = await fetch(`${BASE}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`generate failed ${r.status}: ${await r.text()}`);
    return r.json();
  }

  async segment(
    body: object,
  ): Promise<{ maskPngBase64: string; warning?: "no_color_match" | "empty_mask" }> {
    const r = await fetch(`${BASE}/segment`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`segment failed ${r.status}: ${await r.text()}`);
    return r.json();
  }

  async *chat(body: object): AsyncIterable<unknown> {
    const r = await fetch(`${BASE}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok || !r.body) throw new Error(`chat failed ${r.status}`);
    const reader = r.body.getReader();
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
  }
}

export const codexClient = new CodexClient();

export async function base64PngToImageBitmap(b64: string): Promise<ImageBitmap> {
  const raw = b64.replace(/^data:[^;]+;base64,/, "");
  // atob → binary string → Uint8Array → Blob → ImageBitmap
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  return createImageBitmap(new Blob([bytes], { type: "image/png" }));
}
