import { useEffect, useState } from "react";
import { useSettingsStore } from "../../state/settingsStore";
import { useChatStore } from "../../state/chatStore";
import { codexClient } from "../../ai/codex/client";
import { STYLE_PRESETS } from "../../ai/styles";
import type { AIAutonomy, ImageProviderId } from "../../ai/types";
import styles from "./AIPanel.module.css";

const PROVIDERS: ImageProviderId[] = [
  "mock",
  "openai",
  "codex-canvas",
  "cursor-canvas",
  "gemini-canvas",
];

const AUTONOMY_LABELS: Record<AIAutonomy, string> = {
  propose: "Propose — confirm every generation",
  "auto-confident": "Auto-confident — commit when confidence ≥ 80%",
  agentic: "Agentic — commit when confidence ≥ 80%",
};

interface StatusResponse {
  provider: string;
  providerName: string;
  model: string;
  ready: boolean;
  reason?: string;
  queue: { active: number; pending: number; maxActive: number; maxPending: number };
}

export function SettingsTab() {
  const s = useSettingsStore();
  const [status, setStatus] = useState<StatusResponse | null>(null);

  useEffect(() => {
    let live = true;
    const tick = () =>
      codexClient
        .status()
        .then((r) => live && setStatus(r as StatusResponse))
        .catch(() => {});
    tick();
    const id = setInterval(tick, 10_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  const clearChat = () => {
    useChatStore.getState().clear();
    localStorage.removeItem("painter-ai:chat");
  };

  return (
    <div className={styles.settings}>
      <section className={styles.settingsSection}>
        <h3 className={styles.settingsHeading}>Backend</h3>
        <div className={styles.statusRow}>
          <span className={styles.statusText}>
            Active:{" "}
            {status ? `${status.provider} · ${status.model}` : "…"}
          </span>
          <span
            className={status?.ready ? styles.dotOk : styles.dotBad}
            title={status?.reason ?? (status?.ready ? "Ready" : "Not ready")}
          />
        </div>
        {status && (
          <div className={styles.statusSub}>
            Queue: {status.queue.active}/{status.queue.maxActive} active ·{" "}
            {status.queue.pending}/{status.queue.maxPending} waiting
          </div>
        )}
        <label className={styles.settingsLabel}>
          Override provider
          <select
            className={styles.settingsSelect}
            value={s.providerOverride ?? ""}
            onChange={(e) =>
              s.setProviderOverride(
                e.target.value === "" ? null : (e.target.value as ImageProviderId),
              )
            }
          >
            <option value="">(server default)</option>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.settingsLabel}>
          Override model
          <input
            className={styles.settingsInput}
            type="text"
            value={s.modelOverride ?? ""}
            placeholder="(server default)"
            onChange={(e) => s.setModelOverride(e.target.value || null)}
          />
        </label>
        <button type="button" className={styles.settingsBtn} onClick={() => s.resetOverrides()}>
          Reset to server default
        </button>
      </section>

      <section className={styles.settingsSection}>
        <h3 className={styles.settingsHeading}>Behavior</h3>
        <div className={styles.radioGroup}>
          {(["propose", "auto-confident", "agentic"] as const).map((a) => (
            <label key={a} className={styles.radioLabel}>
              <input
                type="radio"
                name="autonomy"
                checked={s.autonomy === a}
                onChange={() => s.setAutonomy(a)}
              />
              {AUTONOMY_LABELS[a]}
            </label>
          ))}
        </div>
      </section>

      <section className={styles.settingsSection}>
        <h3 className={styles.settingsHeading}>Generation defaults</h3>
        <label className={styles.settingsLabel}>
          Style
          <select
            className={styles.settingsSelect}
            value={s.defaultStyle}
            onChange={(e) => s.setDefaultStyle(e.target.value as typeof s.defaultStyle)}
          >
            {STYLE_PRESETS.map((st) => (
              <option key={st.id} value={st.id}>
                {st.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.settingsLabel}>
          Variations
          <input
            className={styles.settingsInput}
            type="number"
            min={1}
            max={4}
            value={s.defaultVariations}
            onChange={(e) => {
              const n = Math.min(4, Math.max(1, Number(e.target.value) || 1));
              s.setDefaultVariations(n as 1 | 2 | 3 | 4);
            }}
          />
        </label>
        <label className={styles.settingsLabel}>
          Infill feather (px)
          <div className={styles.rangeRow}>
            <input
              type="range"
              min={0}
              max={32}
              value={s.defaultFeatherPx}
              onChange={(e) => s.setDefaultFeatherPx(Number(e.target.value))}
              className={styles.settingsRange}
            />
            <span className={styles.rangeValue}>{s.defaultFeatherPx}px</span>
          </div>
        </label>
      </section>

      <section className={styles.settingsSection}>
        <h3 className={styles.settingsHeading}>Chat</h3>
        <button type="button" className={styles.settingsBtnDanger} onClick={clearChat}>
          Clear chat history
        </button>
      </section>
    </div>
  );
}
