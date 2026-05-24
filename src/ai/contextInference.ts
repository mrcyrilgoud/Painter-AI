import type { AIMode } from "./types";
import type { Selection } from "../state/editorStore";

export function inferModeFromContext(opts: {
  selection: Selection | null;
}): AIMode {
  if (opts.selection) return "inpaint";
  return "newLayer";
}

/**
 * Heuristic — does this prompt read like a localized edit ("remove X", "replace
 * Y", "add a Z here", "fix this", etc.)? Used by the chat tab to short-circuit
 * straight into an inpaint op when the user has a selection, without waiting
 * for the copilot to propose one.
 */
const INPAINT_INTENT_PATTERNS: RegExp[] = [
  /\b(remove|erase|delete|get rid of|take out)\b/i,
  /\b(replace|swap|change)\b.+\bwith\b/i,
  /\b(add|put|place|insert)\b.+\b(here|there|in (this|the) (area|spot|selection))\b/i,
  /\b(fix|clean ?up|repair|patch|retouch)\b/i,
  /\b(inpaint|infill|fill (in|this))\b/i,
  /\bmake (this|the selection|the selected (area|region))\b/i,
];

export function detectInpaintIntent(prompt: string): boolean {
  const p = prompt.trim();
  if (!p) return false;
  return INPAINT_INTENT_PATTERNS.some((re) => re.test(p));
}

export const MODE_LABELS: Record<AIMode, string> = {
  inpaint: "Inpaint",
  outpaint: "Outpaint",
  newLayer: "New Layer",
  img2img: "Img2Img",
  restyle: "Restyle",
};
