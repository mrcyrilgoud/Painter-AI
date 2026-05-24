import "./loadEnv.js";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { bodyLimit } from "hono/body-limit";
import { config } from "./config.js";
import { healthRoute } from "./routes/health.js";
import { statusRoute } from "./routes/status.js";
import { generateRoute } from "./routes/generate.js";
import { segmentRoute } from "./routes/segment.js";
import { chatRoute } from "./routes/chat.js";

const app = new Hono();

// 32 MB ceiling for request bodies. Per-field bounds are enforced by zod in each
// route (see server/src/routes/validation.ts); this is the outer wall.
const MAX_BODY_BYTES = 32 * 1024 * 1024;
const bodyCap = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: (c) =>
    c.json({ error: "payload_too_large", message: "request body exceeds 32 MB" }, 413),
});

app.get("/ai/health", (c) => healthRoute(c));
app.get("/ai/status", (c) => statusRoute(c));
app.post("/ai/chat", bodyCap, (c) => chatRoute(c));
app.post("/ai/generate", bodyCap, (c) => generateRoute(c));
app.post("/ai/segment", bodyCap, (c) => segmentRoute(c));

serve({ fetch: app.fetch, port: config.port, hostname: "127.0.0.1" });
console.log(`[painter-ai-server] listening on http://127.0.0.1:${config.port}`);
console.log(
  `[painter-ai-server] codex model: ${config.codexModel} (${config.codexApiKey ? "key set" : "key missing"})`,
);
console.log(`[painter-ai-server] image provider: ${config.imageProvider}`);
