import { create } from "zustand";

interface UIState {
  commandBarOpen: boolean;
  openCommandBar: () => void;
  closeCommandBar: () => void;
  toggleCommandBar: () => void;
}

const createUI = () =>
  create<UIState>((set) => ({
    commandBarOpen: false,
    openCommandBar: () => set({ commandBarOpen: true }),
    closeCommandBar: () => set({ commandBarOpen: false }),
    toggleCommandBar: () => set((s) => ({ commandBarOpen: !s.commandBarOpen })),
  }));

type Store = ReturnType<typeof createUI>;
const g = globalThis as unknown as { __painterUIStore?: Store };
export const useUIStore: Store = g.__painterUIStore ?? (g.__painterUIStore = createUI());
