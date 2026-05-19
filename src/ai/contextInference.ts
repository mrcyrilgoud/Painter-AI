import type { AIMode } from "./types";
import type { Selection } from "../state/editorStore";

export function inferModeFromContext(opts: {
  selection: Selection | null;
  hasReferences: boolean;
  outpainting?: boolean;
}): AIMode {
  if (opts.outpainting) return "outpaint";
  if (opts.selection) return "inpaint";
  if (opts.hasReferences) return "img2img";
  return "newLayer";
}

export const MODE_LABELS: Record<AIMode, string> = {
  inpaint: "Inpaint",
  outpaint: "Outpaint",
  newLayer: "New Layer",
  img2img: "Img2Img",
  restyle: "Restyle",
};
