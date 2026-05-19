import type { Context } from "hono";
import { spawn } from "node:child_process";
import { config } from "../config.js";
import { imageProvider } from "../imageApi/index.js";

async function codexReachable(): Promise<{ reachable: boolean; reason?: string }> {
  return new Promise((resolve) => {
    try {
      const child = spawn(config.codexBin, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      child.stdout.on("data", (d: Buffer) => (out += d.toString()));
      child.on("error", (err) => resolve({ reachable: false, reason: err.message }));
      child.on("close", (code) =>
        resolve(code === 0 ? { reachable: true, reason: out.trim() } : { reachable: false, reason: `exit ${code}` }),
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
