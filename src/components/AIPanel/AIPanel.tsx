import { useState } from "react";
import { useEditorStore, type AIAutonomy } from "../../state/editorStore";
import { ChatTab } from "./ChatTab";
import { HistoryTab } from "./HistoryTab";
import { ReferencesTab } from "./ReferencesTab";
import styles from "./AIPanel.module.css";

type Tab = "chat" | "history" | "references";

const AUTONOMY_LABELS: Record<AIAutonomy, string> = {
  propose: "Propose",
  "auto-confident": "Auto-confident",
  agentic: "Agentic",
};

export function AIPanel() {
  const [tab, setTab] = useState<Tab>("chat");
  const { aiAutonomy, setAIAutonomy } = useEditorStore();
  const [autonomyOpen, setAutonomyOpen] = useState(false);

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
          className={`${styles.tab} ${tab === "history" ? styles.active : ""}`}
          onClick={() => setTab("history")}
        >
          History
        </button>
        <button
          className={`${styles.tab} ${tab === "references" ? styles.active : ""}`}
          onClick={() => setTab("references")}
        >
          Refs
        </button>
      </div>

      {tab === "chat" && (
        <>
          <div className={styles.autonomyRow}>
            <button
              className={styles.autonomyChip}
              onClick={() => setAutonomyOpen((v) => !v)}
              title="Change copilot autonomy"
            >
              <span className={styles.autonomyDot} data-mode={aiAutonomy} />
              {AUTONOMY_LABELS[aiAutonomy]}
              <span className={styles.caret}>▾</span>
            </button>
            {autonomyOpen && (
              <div className={styles.autonomyMenu}>
                {(["propose", "auto-confident", "agentic"] as AIAutonomy[]).map((m) => (
                  <button
                    key={m}
                    className={styles.autonomyOption}
                    onClick={() => {
                      setAIAutonomy(m);
                      setAutonomyOpen(false);
                    }}
                  >
                    <span className={styles.autonomyDot} data-mode={m} />
                    {AUTONOMY_LABELS[m]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ChatTab />
        </>
      )}

      {tab === "history" && <HistoryTab />}
      {tab === "references" && <ReferencesTab />}
    </aside>
  );
}
