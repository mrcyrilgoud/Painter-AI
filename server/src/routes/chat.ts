import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { runCodexCollectText } from "../codex/runCodex.js";
import { CHAT_SYSTEM } from "../codex/systemPrompts.js";
import { chatSchema, formatZodError, type ChatInput } from "./validation.js";
import { logError, logInfo, newRequestId } from "../log.js";

function describeContext(ctx: ChatInput["context"]): string {
  const lines: string[] = [];
  lines.push(`Canvas: ${ctx.dimensions.width}×${ctx.dimensions.height}`);
  if (ctx.hasSelection && ctx.selectionBounds) {
    const s = ctx.selectionBounds;
    lines.push(
      `Selection: yes, bounding box (${Math.round(s.x)},${Math.round(s.y)}) ${Math.round(s.w)}×${Math.round(s.h)}`,
    );
  } else {
    lines.push("Selection: none");
  }
  lines.push(`Layers (${ctx.layers.length}):`);
  for (const l of ctx.layers) {
    lines.push(`  - ${l.name}${l.isAI ? " [AI]" : ""}${l.visible ? "" : " (hidden)"}`);
  }
  if (ctx.recentOps.length > 0) {
    lines.push(`Recent ops:`);
    for (const o of ctx.recentOps.slice(-5)) {
      lines.push(`  - ${o.mode}/${o.style}: ${o.prompt}`);
    }
  }
  return lines.join("\n");
}

interface ParsedReply {
  text: string;
  op?: {
    mode: "inpaint" | "outpaint" | "newLayer" | "img2img" | "restyle";
    prompt: string;
    style: string;
    confidence: number;
  };
}

function parseReply(raw: string): ParsedReply {
  // Look for a fenced ```json-op block at the end of the reply.
  const match = raw.match(/```json-op\s*([\s\S]*?)```/);
  if (!match) return { text: raw.trim() };
  let parsed: ParsedReply["op"] | null = null;
  try {
    const obj = JSON.parse(match[1]);
    if (
      obj &&
      typeof obj.mode === "string" &&
      typeof obj.prompt === "string" &&
      ["inpaint", "outpaint", "newLayer", "img2img", "restyle"].includes(obj.mode)
    ) {
      parsed = {
        mode: obj.mode,
        prompt: obj.prompt,
        style: typeof obj.style === "string" ? obj.style : "none",
        confidence: typeof obj.confidence === "number" ? Math.max(0, Math.min(1, obj.confidence)) : 0.75,
      };
    }
  } catch {
    // ignore — treat as text only
  }
  const text = raw.replace(/```json-op\s*[\s\S]*?```/, "").trim();
  return { text, op: parsed ?? undefined };
}

function chunkText(text: string): string[] {
  // Split on sentence boundaries; fall back to fixed-size chunks.
  const sentences = text.match(/[^.!?\n]+[.!?\n]?/g);
  if (sentences && sentences.length > 1) return sentences;
  return text.match(/.{1,40}(\s|$)/g) ?? [text];
}

export async function chatRoute(c: Context) {
  const reqId = newRequestId();
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json", message: "request body must be JSON" }, 400);
  }
  const parsed = chatSchema.safeParse(raw);
  if (!parsed.success) {
    logInfo(reqId, "/ai/chat", "rejected", { reason: formatZodError(parsed.error) });
    return c.json(
      { error: "invalid_request", message: formatZodError(parsed.error) },
      400,
    );
  }
  const body = parsed.data;

  const userPrompt = `${describeContext(body.context)}\n\nUser: ${body.message}`;
  const t0 = Date.now();
  logInfo(reqId, "/ai/chat", "start", { messageLen: body.message.length });

  return streamSSE(c, async (stream) => {
    const signal = c.req.raw.signal;
    try {
      const rawReply = await runCodexCollectText({
        prompt: userPrompt,
        systemPrompt: CHAT_SYSTEM,
        signal,
      });
      const reply = parseReply(rawReply);

      if (reply.text) {
        for (const chunk of chunkText(reply.text)) {
          await stream.writeSSE({ data: JSON.stringify({ kind: "text", text: chunk }) });
        }
      }
      if (reply.op) {
        await stream.writeSSE({
          data: JSON.stringify({
            kind: "op-proposal",
            request: {
              mode: reply.op.mode,
              prompt: reply.op.prompt,
              style: reply.op.style,
            },
            confidence: reply.op.confidence,
          }),
        });
      }
      await stream.writeSSE({ data: JSON.stringify({ kind: "done" }) });
      logInfo(reqId, "/ai/chat", "ok", { ms: Date.now() - t0, hasOp: !!reply.op });
    } catch (e) {
      logError(reqId, "/ai/chat", `failed after ${Date.now() - t0}ms`, e);
      await stream.writeSSE({
        data: JSON.stringify({
          kind: "text",
          text: "⚠ Copilot error. Please try again.",
        }),
      });
      await stream.writeSSE({ data: JSON.stringify({ kind: "done" }) });
    }
  });
}
