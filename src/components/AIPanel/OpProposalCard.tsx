import type { ChatMessage } from "../../state/chatStore";
import { commitVariation, dismissOp, cancelOp } from "../../ai/runOp";
import { MODE_LABELS } from "../../ai/contextInference";
import { VariationsGrid } from "./VariationsGrid";
import styles from "./AIPanel.module.css";

interface Props {
  message: Extract<ChatMessage, { kind: "op-proposal" }>;
}

export function OpProposalCard({ message }: Props) {
  const { request, confidence, status, progress, variations, committedVariationIndex, via } = message;

  return (
    <div className={styles.opCard}>
      <div className={styles.opHeader}>
        <span className={styles.opMode}>{MODE_LABELS[request.mode]}</span>
        {via === "cmdk" && <span className={styles.opVia} title="Via Cmd+K">⌘K</span>}
        <span className={styles.opPrompt} title={request.prompt}>{request.prompt}</span>
        <span className={styles.opConfidence} title={`Confidence ${Math.round(confidence * 100)}%`}>
          {Math.round(confidence * 100)}%
        </span>
      </div>
      <VariationsGrid
        variations={variations ?? []}
        status={status}
        progress={progress}
        committedIndex={committedVariationIndex}
        onCommit={(i) => commitVariation(message.id, i)}
      />
      {status === "generating" && (
        <div className={styles.opActions}>
          <button className={styles.opGhost} onClick={() => cancelOp(message.id)}>
            Cancel
          </button>
          <span className={styles.opHint}>
            {progress != null ? `Generating… ${Math.round(progress)}%` : "Generating…"}
          </span>
        </div>
      )}
      {status === "ready" && (
        <div className={styles.opActions}>
          <button className={styles.opGhost} onClick={() => dismissOp(message.id)}>
            Dismiss
          </button>
          <span className={styles.opHint}>Click a tile to commit · hover to preview</span>
        </div>
      )}
      {status === "committed" && (
        <div className={styles.opActions}>
          <span className={styles.opCommitted}>✓ Committed variation {(committedVariationIndex ?? 0) + 1}</span>
        </div>
      )}
      {status === "dismissed" && (
        <div className={styles.opActions}>
          <span className={styles.opDismissed}>Dismissed</span>
        </div>
      )}
    </div>
  );
}
