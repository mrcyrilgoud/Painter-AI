import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AIAutonomy, ImageProviderId } from "../ai/types";
import type { StyleId } from "../ai/styles";

interface SettingsState {
  providerOverride: ImageProviderId | null;
  modelOverride: string | null;
  autonomy: AIAutonomy;
  defaultStyle: StyleId;
  defaultVariations: 1 | 2 | 3 | 4;
  defaultFeatherPx: number;
  setProviderOverride: (id: ImageProviderId | null) => void;
  setModelOverride: (m: string | null) => void;
  setAutonomy: (a: AIAutonomy) => void;
  setDefaultStyle: (s: StyleId) => void;
  setDefaultVariations: (n: 1 | 2 | 3 | 4) => void;
  setDefaultFeatherPx: (n: number) => void;
  resetOverrides: () => void;
}

const createSettings = () =>
  create<SettingsState>()(
    persist(
      (set) => ({
        providerOverride: null,
        modelOverride: null,
        autonomy: "propose",
        defaultStyle: "none",
        defaultVariations: 2,
        defaultFeatherPx: 8,
        setProviderOverride: (providerOverride) => set({ providerOverride }),
        setModelOverride: (modelOverride) => set({ modelOverride }),
        setAutonomy: (autonomy) => set({ autonomy }),
        setDefaultStyle: (defaultStyle) => set({ defaultStyle }),
        setDefaultVariations: (defaultVariations) => set({ defaultVariations }),
        setDefaultFeatherPx: (defaultFeatherPx) =>
          set({ defaultFeatherPx: Math.max(0, Math.min(64, defaultFeatherPx | 0)) }),
        resetOverrides: () => set({ providerOverride: null, modelOverride: null }),
      }),
      { name: "painter-ai:settings", storage: createJSONStorage(() => localStorage) },
    ),
  );

type Store = ReturnType<typeof createSettings>;
const g = globalThis as unknown as { __painterSettingsStore?: Store };
export const useSettingsStore: Store =
  g.__painterSettingsStore ?? (g.__painterSettingsStore = createSettings());
