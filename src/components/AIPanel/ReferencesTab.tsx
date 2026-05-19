import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "../../state/editorStore";
import type { ReferenceImage } from "../../ai/types";
import { uid } from "../../utils/canvas";
import styles from "./AIPanel.module.css";

const ROLES: ReferenceImage["role"][] = ["style", "subject", "composition", "color"];
const MAX_REFS = 4;

export function ReferencesTab() {
  const references = useEditorStore((s) => s.references);
  const addReference = useEditorStore((s) => s.addReference);
  const [dragOver, setDragOver] = useState(false);

  const ingestFile = async (file: File) => {
    if (references.length >= MAX_REFS) return;
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const bm = await createImageBitmap(img);
      addReference({
        id: uid(),
        image: bm,
        role: "style",
        weight: 0.6,
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = [...(e.dataTransfer.files ?? [])].filter((f) => f.type.startsWith("image/"));
    for (const f of files) {
      await ingestFile(f);
      if (useEditorStore.getState().references.length >= MAX_REFS) break;
    }
  };

  return (
    <div className={styles.refsTab}>
      <div
        className={`${styles.dropZone} ${dragOver ? styles.dropOver : ""} ${references.length >= MAX_REFS ? styles.dropFull : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <label className={styles.dropInner}>
          {references.length >= MAX_REFS
            ? "Maximum of 4 references reached"
            : "Drop or paste images here · click to browse"}
          <input
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={async (e) => {
              const files = [...(e.target.files ?? [])];
              for (const f of files) {
                await ingestFile(f);
                if (useEditorStore.getState().references.length >= MAX_REFS) break;
              }
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <div className={styles.refsList}>
        {references.map((r) => (
          <ReferenceCard key={r.id} reference={r} />
        ))}
      </div>
    </div>
  );
}

function ReferenceCard({ reference }: { reference: ReferenceImage }) {
  const updateReference = useEditorStore((s) => s.updateReference);
  const removeReference = useEditorStore((s) => s.removeReference);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const target = 56;
    const ar = reference.image.width / reference.image.height;
    if (ar >= 1) {
      c.width = Math.round(target * dpr);
      c.height = Math.round((target / ar) * dpr);
    } else {
      c.width = Math.round(target * ar * dpr);
      c.height = Math.round(target * dpr);
    }
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(reference.image, 0, 0, c.width, c.height);
  }, [reference]);

  return (
    <div className={styles.refCard}>
      <canvas ref={canvasRef} className={styles.refThumb} />
      <div className={styles.refMeta}>
        <div className={styles.refRoleRow}>
          <select
            className={styles.refRole}
            value={reference.role}
            onChange={(e) =>
              updateReference(reference.id, { role: e.target.value as ReferenceImage["role"] })
            }
            title="Reference role"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            className={styles.refRemove}
            onClick={() => removeReference(reference.id)}
            title="Remove reference"
            aria-label="Remove reference"
          >
            ✕
          </button>
        </div>
        <div className={styles.refWeightRow}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={reference.weight}
            onChange={(e) =>
              updateReference(reference.id, { weight: parseFloat(e.target.value) })
            }
            className={styles.refWeight}
            title="Weight"
          />
          <span className={styles.refWeightValue}>{Math.round(reference.weight * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
