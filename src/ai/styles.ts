export interface StylePreset {
  id: string;
  label: string;
  thumb: string;
  palette: string[];
}

export const STYLE_PRESETS: StylePreset[] = [
  { id: "none", label: "Default", thumb: "#c0c0c0", palette: ["#a0c0e0", "#e0c0a0", "#c0e0a0", "#e0a0c0"] },
  { id: "oilpaint", label: "Oil Paint", thumb: "#d4824a", palette: ["#c0392b", "#e67e22", "#f1c40f", "#8e44ad"] },
  { id: "anime", label: "Anime", thumb: "#6ab4f5", palette: ["#6ab4f5", "#f5a0c8", "#ffffff", "#c8a0f5"] },
  { id: "sketch", label: "Sketch", thumb: "#8a8a8a", palette: ["#444444", "#888888", "#cccccc", "#222222"] },
  { id: "watercolor", label: "Watercolor", thumb: "#a0d8ef", palette: ["#a0d8ef", "#b0e0e6", "#87ceeb", "#5f9ea0"] },
  { id: "pixel", label: "Pixel Art", thumb: "#70c060", palette: ["#70c060", "#f0e030", "#e04040", "#4070f0"] },
];

export type StyleId = (typeof STYLE_PRESETS)[number]["id"];

export function getStyle(id: string) {
  return STYLE_PRESETS.find((s) => s.id === id) ?? STYLE_PRESETS[0];
}
