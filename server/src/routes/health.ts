import type { Context } from "hono";
import { config } from "../config.js";
import { codexAuthAvailable } from "../codex/runCodex.js";
import { imageProvider } from "../imageApi/index.js";

function codexConfigured(): { reachable: boolean; reason?: string } {
  if (config.codexApiKey) return { reachable: true, reason: `api key · ${config.codexModel}` };
  if (codexAuthAvailable()) return { reachable: true, reason: `codex login · ${config.codexModel}` };
  return { reachable: false, reason: "no CODEX_API_KEY and no ~/.codex/auth.json (run `codex login`)" };
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
