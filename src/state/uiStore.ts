import { create } from "zustand";

export type AIPanelTab = "chat" | "settings";

interface UIState {
  commandBarOpen: boolean;
  openCommandBar: () => void;
  closeCommandBar: () => void;
  toggleCommandBar: () => void;
  aiPanelTab: AIPanelTab;
  setAiPanelTab: (tab: AIPanelTab) => void;
}

const createUI = () =>
  create<UIState>((set) => ({
    commandBarOpen: false,
    openCommandBar: () => set({ commandBarOpen: true }),
    closeCommandBar: () => set({ commandBarOpen: false }),
    toggleCommandBar: () => set((s) => ({ commandBarOpen: !s.commandBarOpen })),
    aiPanelTab: "chat",
    setAiPanelTab: (aiPanelTab) => set({ aiPanelTab }),
  }));

type Store = ReturnType<typeof createUI>;
const g = globalThis as unknown as { __painterUIStore?: Store };
export const useUIStore: Store = g.__painterUIStore ?? (g.__painterUIStore = createUI());
