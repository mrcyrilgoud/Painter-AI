import { useState } from "react";
import { useEditorStore, type Layer } from "../../state/editorStore";
import styles from "./LayersPanel.module.css";

export function LayersPanel() {
  const layers = useEditorStore((s) => s.layers);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer);
  const addLayer = useEditorStore((s) => s.addLayer);
  const removeLayer = useEditorStore((s) => s.removeLayer);
  const toggleLayerVisibility = useEditorStore((s) => s.toggleLayerVisibility);
  const setLayerOpacity = useEditorStore((s) => s.setLayerOpacity);
  const reorderLayer = useEditorStore((s) => s.reorderLayer);
  const bumpRender = useEditorStore((s) => s.bumpRender);

  const [collapsed, setCollapsed] = useState(false);

  // Display layers top-to-bottom (top of UI list = top of paint stack)
  const ordered = [...layers].reverse();

  return (
    <aside className={`${styles.panel} ${collapsed ? styles.collapsed : ""}`}>
      <div className={styles.header}>
        <button
          className={styles.collapse}
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand layers" : "Collapse layers"}
          title={collapsed ? "Expand layers" : "Collapse layers"}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <span className={styles.title}>Layers</span>
        <span className={styles.spacer} />
        {!collapsed && (
          <>
            <button
              className={styles.iconBtn}
              onClick={() => addLayer()}
              title="Add layer"
              aria-label="Add layer"
            >
              ＋
            </button>
            <button
              className={styles.iconBtn}
              onClick={() => removeLayer(activeLayerId)}
              disabled={layers.length <= 1}
              title="Delete active layer"
              aria-label="Delete active layer"
            >
              🗑
            </button>
          </>
        )}
      </div>
      {!collapsed && (
        <div className={styles.list}>
          {ordered.map((layer, displayIdx) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              active={layer.id === activeLayerId}
              onSelect={() => setActiveLayer(layer.id)}
              onToggleVisible={(e) => {
                e.stopPropagation();
                toggleLayerVisibility(layer.id);
                bumpRender();
              }}
              onOpacityChange={(v) => {
                setLayerOpacity(layer.id, v);
                bumpRender();
              }}
              onMoveUp={
                displayIdx > 0
                  ? () => reorderLayer(layer.id, layers.length - displayIdx)
                  : undefined
              }
              onMoveDown={
                displayIdx < ordered.length - 1
                  ? () => reorderLayer(layer.id, layers.length - displayIdx - 2)
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </aside>
  );
}

interface LayerRowProps {
  layer: Layer;
  active: boolean;
  onSelect: () => void;
  onToggleVisible: (e: React.MouseEvent) => void;
  onOpacityChange: (v: number) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function LayerRow({
  layer,
  active,
  onSelect,
  onToggleVisible,
  onOpacityChange,
  onMoveUp,
  onMoveDown,
}: LayerRowProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={`${styles.row} ${active ? styles.active : ""}`}
      onClick={onSelect}
      title={layer.aiProvenance?.prompt}
    >
      <button
        className={styles.eye}
        onClick={onToggleVisible}
        aria-label={layer.visible ? "Hide layer" : "Show layer"}
        title={layer.visible ? "Hide" : "Show"}
      >
        {layer.visible ? "●" : "○"}
      </button>
      {layer.aiProvenance && <span className={styles.aiBadge} title="AI-generated">✦</span>}
      <span className={styles.name}>{layer.name}</span>
      <button
        className={styles.expand}
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
        title="Layer options"
      >
        ⋯
      </button>
      {expanded && (
        <div className={styles.expanded} onClick={(e) => e.stopPropagation()}>
          <div className={styles.opacityRow}>
            <span className={styles.opacityLabel}>Opacity</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={layer.opacity}
              onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
              className={styles.opacitySlider}
            />
            <span className={styles.opacityValue}>{Math.round(layer.opacity * 100)}%</span>
          </div>
          <div className={styles.reorderRow}>
            <button
              className={styles.miniBtn}
              onClick={onMoveUp}
              disabled={!onMoveUp}
              title="Move up"
            >
              ▲
            </button>
            <button
              className={styles.miniBtn}
              onClick={onMoveDown}
              disabled={!onMoveDown}
              title="Move down"
            >
              ▼
            </button>
            {layer.aiProvenance && (
              <span className={styles.provenance} title={layer.aiProvenance.prompt}>
                seed {layer.aiProvenance.seed} · {layer.aiProvenance.style}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
