import { readFileSync } from "node:fs";

/**
 * Load server/.env into process.env before config.ts is evaluated.
 * NODE_OPTIONS forbids --env-file, and tsx's CLI doesn't forward it, so we
 * parse a tiny KEY=VALUE format ourselves. Existing process.env wins.
 *
 * Import this module first in index.ts (before ./config.js).
 */
try {
  const text = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith("#")) continue;
    if (process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
} catch {
  /* no .env, that's fine — defaults apply */
}
