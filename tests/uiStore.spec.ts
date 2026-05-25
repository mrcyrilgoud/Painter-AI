import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "../src/state/uiStore";

describe("uiStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    const s = useUIStore.getState();
    s.closeCommandBar();
    s.setAiPanelTab("chat");
  });

  it("manages command bar visibility", () => {
    const s = useUIStore.getState();
    expect(s.commandBarOpen).toBe(false);

    s.openCommandBar();
    expect(useUIStore.getState().commandBarOpen).toBe(true);

    s.closeCommandBar();
    expect(useUIStore.getState().commandBarOpen).toBe(false);

    s.toggleCommandBar();
    expect(useUIStore.getState().commandBarOpen).toBe(true);

    s.toggleCommandBar();
    expect(useUIStore.getState().commandBarOpen).toBe(false);
  });

  it("manages panel tab selection", () => {
    const s = useUIStore.getState();
    expect(s.aiPanelTab).toBe("chat");

    s.setAiPanelTab("settings");
    expect(useUIStore.getState().aiPanelTab).toBe("settings");
  });

  it("increments chatInputFocusTrigger on triggerChatInputFocus", () => {
    const s = useUIStore.getState();
    const initial = s.chatInputFocusTrigger;

    s.triggerChatInputFocus();
    expect(useUIStore.getState().chatInputFocusTrigger).toBe(initial + 1);

    s.triggerChatInputFocus();
    expect(useUIStore.getState().chatInputFocusTrigger).toBe(initial + 2);
  });
});
