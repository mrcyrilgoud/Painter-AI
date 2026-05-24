import { useUIStore } from "../../state/uiStore";
import { ChatTab } from "./ChatTab";
import { SettingsTab } from "./SettingsTab";
import styles from "./AIPanel.module.css";

export function AIPanel() {
  const tab = useUIStore((s) => s.aiPanelTab);
  const setTab = useUIStore((s) => s.setAiPanelTab);

  return (
    <aside className={styles.panel}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "chat" ? styles.active : ""}`}
          onClick={() => setTab("chat")}
        >
          Chat
        </button>
        <button
          className={`${styles.tab} ${tab === "settings" ? styles.active : ""}`}
          onClick={() => setTab("settings")}
        >
          Settings
        </button>
      </div>
      {tab === "chat" ? <ChatTab /> : <SettingsTab />}
    </aside>
  );
}
