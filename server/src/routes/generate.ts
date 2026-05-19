import type { Context } from "hono";
import { imageProvider } from "../imageApi/index.js";
import { generateSchema, formatZodError } from "./validation.js";
import { logError, logInfo, newRequestId } from "../log.js";

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

  const ready = imageProvider.isReady();
  if (!ready.ready) {
    logInfo(reqId, "/ai/generate", "provider_not_ready", { reason: ready.reason });
    return c.json(
      { error: "provider_not_ready", message: `image provider not ready: ${ready.reason}` },
      503,
    );
  }

  const t0 = Date.now();
  logInfo(reqId, "/ai/generate", "start", {
    provider: imageProvider.name,
    width: body.width,
    height: body.height,
    variations: body.variations,
    mode: body.mode,
  });
  try {
    const result = await imageProvider.generate(body);
    logInfo(reqId, "/ai/generate", "ok", { ms: Date.now() - t0 });
    return c.json(result);
  } catch (e) {
    logError(reqId, "/ai/generate", `failed after ${Date.now() - t0}ms`, e);
    return c.json(
      { error: "generation_failed", message: "Generation failed. Please try again." },
      500,
    );
  }
}
