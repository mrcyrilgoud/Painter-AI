import type { Context } from "hono";
import { pickProvider } from "../imageApi/index.js";
import { generateSchema, formatZodError } from "./validation.js";
import { logError, logInfo, newRequestId } from "../log.js";
import { GENERATION_QUEUE_FULL } from "./generateQueue.js";
import { generateQueue } from "./generateQueueInstance.js";
import { isAbortError } from "../abort.js";

export async function generateRoute(c: Context) {
  const reqId = newRequestId();
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json", message: "request body must be JSON" }, 400);
  }
  const parsed = generateSchema.safeParse(raw);
  if (!parsed.success) {
    logInfo(reqId, "/ai/generate", "rejected", { reason: formatZodError(parsed.error) });
    return c.json(
      { error: "invalid_request", message: formatZodError(parsed.error) },
      400,
    );
  }
  const body = parsed.data;

  const provider = pickProvider(body.providerOverride ?? null);
  const ready = provider.isReady();
  if (!ready.ready) {
    logInfo(reqId, "/ai/generate", "provider_not_ready", {
      provider: provider.name,
      reason: ready.reason,
    });
    return c.json(
      { error: "provider_not_ready", message: `image provider not ready: ${ready.reason}` },
      503,
    );
  }

  const inputBytes = {
    source: body.sourcePngBase64?.length ?? 0,
    mask: body.maskPngBase64?.length ?? 0,
  };

  const t0 = Date.now();
  logInfo(reqId, "/ai/generate", "start", {
    provider: provider.name,
    providerOverride: body.providerOverride ?? null,
    modelOverride: body.modelOverride ?? null,
    width: body.width,
    height: body.height,
    variations: body.variations,
    mode: body.mode,
    inputBytes,
    maskBoundsPx: body.maskBoundsPx,
  });

  const signal = c.req.raw.signal;

  try {
    const result = await generateQueue.run(
      () =>
        provider.generate(body, {
          signal,
          modelOverride: body.modelOverride ?? null,
        }),
      signal,
    );
    const outputBytes = result.variationsBase64.reduce((sum, b64) => sum + b64.length, 0);
    logInfo(reqId, "/ai/generate", "ok", {
      ms: Date.now() - t0,
      provider: provider.name,
      mode: body.mode,
      outputKind: result.outputKind ?? "full-canvas",
      outputBytes,
      variationCount: result.variationsBase64.length,
    });
    return c.json(result);
  } catch (e) {
    if (isAbortError(e)) {
      logInfo(reqId, "/ai/generate", "aborted", { ms: Date.now() - t0 });
      return new Response(
        JSON.stringify({ error: "aborted", message: "Generation was cancelled." }),
        { status: 499, headers: { "Content-Type": "application/json" } },
      );
    }
    if (e instanceof Error && e.message === GENERATION_QUEUE_FULL) {
      logInfo(reqId, "/ai/generate", "busy", { ms: Date.now() - t0 });
      return c.json(
        { error: "busy", message: "Image generation is busy. Try again shortly." },
        429,
      );
    }
    logError(reqId, "/ai/generate", `failed after ${Date.now() - t0}ms`, e);
    return c.json(
      { error: "generation_failed", message: "Generation failed. Please try again." },
      500,
    );
  }
}
