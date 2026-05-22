import { useEffect, useRef, useCallback } from "react";
import { useEditorStore } from "../../state/editorStore";
import { getToolHandler } from "./tools";
import type { ToolPoint } from "./tools/types";
import { SelectionOverlay } from "./SelectionOverlay";
import { PreviewLayer } from "./PreviewLayer";
import { LayersPanel } from "../Layers/LayersPanel";
import { FloatingActions } from "./FloatingActions";
import styles from "./CanvasStage.module.css";

export function CanvasStage() {
  const dimensions = useEditorStore((s) => s.dimensions);
  const layers = useEditorStore((s) => s.layers);
  const activeTool = useEditorStore((s) => s.activeTool);
  const renderTick = useEditorStore((s) => s.renderTick);

  const stageRef = useRef<HTMLElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const layerContainerRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const activeHandlerRef = useRef<ReturnType<typeof getToolHandler> | null>(null);

  // Fit canvas wrap to stage with "contain" behavior
  useEffect(() => {
    const stage = stageRef.current;
    const wrap = wrapRef.current;
    if (!stage || !wrap) return;
    const fit = () => {
      const padding = 48;
      const stageW = Math.max(0, stage.clientWidth - padding);
      const stageH = Math.max(0, stage.clientHeight - padding);
      const ar = dimensions.width / dimensions.height;
      if (stageW / stageH > ar) {
        // height-bound
        const h = Math.min(stageH, dimensions.height);
        wrap.style.height = `${h}px`;
        wrap.style.width = `${h * ar}px`;
      } else {
        // width-bound
        const w = Math.min(stageW, dimensions.width);
        wrap.style.width = `${w}px`;
        wrap.style.height = `${w / ar}px`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [dimensions]);

  // Mount layer canvases as DOM children. Re-mount whenever layers identity changes.
  useEffect(() => {
    const host = layerContainerRef.current;
    if (!host) return;
    host.innerHTML = "";
    for (const layer of layers) {
      layer.canvas.style.position = "absolute";
      layer.canvas.style.top = "0";
      layer.canvas.style.left = "0";
      layer.canvas.style.width = "100%";
      layer.canvas.style.height = "100%";
      layer.canvas.style.display = layer.visible ? "block" : "none";
      layer.canvas.style.opacity = String(layer.opacity);
      layer.canvas.style.mixBlendMode = layer.blendMode === "source-over" ? "normal" : layer.blendMode;
      layer.canvas.style.imageRendering = "pixelated";
      host.appendChild(layer.canvas);
    }
  }, [layers]);

  // On every renderTick, refresh per-layer style (visibility/opacity) without re-mounting.
  useEffect(() => {
    for (const layer of layers) {
      layer.canvas.style.display = layer.visible ? "block" : "none";
      layer.canvas.style.opacity = String(layer.opacity);
    }
  }, [layers, renderTick]);

  // Set overlay canvas dimensions
  useEffect(() => {
    const o = overlayRef.current;
    if (!o) return;
    o.width = dimensions.width;
    o.height = dimensions.height;
  }, [dimensions]);

  const getPoint = useCallback(
    (e: PointerEvent | React.PointerEvent): ToolPoint => {
      const rect = wrapRef.current!.getBoundingClientRect();
      const scaleX = dimensions.width / rect.width;
      const scaleY = dimensions.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
        pressure: (e as PointerEvent).pressure || 0.5,
      };
    },
    [dimensions],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    const state = useEditorStore.getState();
    const layer = state.layers.find((l) => l.id === state.activeLayerId);
    if (!layer) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic events may not support capture */ }
    drawingRef.current = true;
    const handler = getToolHandler(activeTool);
    activeHandlerRef.current = handler;
    const overlay = overlayRef.current!.getContext("2d")!;
    handler.onDown(
      {
        layer,
        ctx: layer.canvas.getContext("2d")!,
        overlay,
        state,
        dimensions,
        setStatus: state.setStatusText,
        commitStroke: (before) => {
          const after = layer.canvas
            .getContext("2d")!
            .getImageData(0, 0, layer.canvas.width, layer.canvas.height);
          state.commitPixelChange(layer.id, before, after);
        },
        setSelection: state.setSelection,
        clearOverlay: () => overlay.clearRect(0, 0, overlayRef.current!.width, overlayRef.current!.height),
        bumpRender: state.bumpRender,
      },
      getPoint(e),
    );
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current || !activeHandlerRef.current) return;
    const state = useEditorStore.getState();
    const layer = state.layers.find((l) => l.id === state.activeLayerId);
    if (!layer) return;
    const overlay = overlayRef.current!.getContext("2d")!;
    activeHandlerRef.current.onMove(
      {
        layer,
        ctx: layer.canvas.getContext("2d")!,
        overlay,
        state,
        dimensions,
        setStatus: state.setStatusText,
        commitStroke: () => {},
        setSelection: state.setSelection,
        clearOverlay: () => overlay.clearRect(0, 0, overlayRef.current!.width, overlayRef.current!.height),
        bumpRender: state.bumpRender,
      },
      getPoint(e),
    );
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drawingRef.current || !activeHandlerRef.current) return;
    drawingRef.current = false;
    const state = useEditorStore.getState();
    const layer = state.layers.find((l) => l.id === state.activeLayerId);
    if (!layer) return;
    const overlay = overlayRef.current!.getContext("2d")!;
    activeHandlerRef.current.onUp(
      {
        layer,
        ctx: layer.canvas.getContext("2d")!,
        overlay,
        state,
        dimensions,
        setStatus: state.setStatusText,
        commitStroke: (before) => {
          const after = layer.canvas
            .getContext("2d")!
            .getImageData(0, 0, layer.canvas.width, layer.canvas.height);
          state.commitPixelChange(layer.id, before, after);
        },
        setSelection: state.setSelection,
        clearOverlay: () => overlay.clearRect(0, 0, overlayRef.current!.width, overlayRef.current!.height),
        bumpRender: state.bumpRender,
      },
      getPoint(e),
    );
    activeHandlerRef.current = null;
  };

  // Cancel any in-progress stroke if the window loses focus (e.g. user alt-tabs
  // while holding the mouse button). Without this, drawingRef stays true and
  // the next pointerMove produces a ghost stroke from the stale last position.
  useEffect(() => {
    const onBlur = () => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      activeHandlerRef.current = null;
      // Clear any overlay marks left by a cancelled selection/shape drag.
      const o = overlayRef.current;
      if (o) o.getContext("2d")!.clearRect(0, 0, o.width, o.height);
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        useEditorStore.getState().undo();
      } else if (meta && (e.key.toLowerCase() === "z" && e.shiftKey || e.key.toLowerCase() === "y")) {
        e.preventDefault();
        useEditorStore.getState().redo();
      } else if (e.key === "[") {
        useEditorStore.getState().setBrushSize(Math.max(1, useEditorStore.getState().brushSize - 1));
      } else if (e.key === "]") {
        useEditorStore.getState().setBrushSize(Math.min(64, useEditorStore.getState().brushSize + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handler = getToolHandler(activeTool);

  return (
    <main ref={stageRef} className={styles.stage}>
      <LayersPanel />
      <div
        ref={wrapRef}
        className={styles.canvasWrap}
        style={{ cursor: handler.cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div ref={layerContainerRef} className={styles.layerStack} />
        <PreviewLayer />
        <canvas ref={overlayRef} className={styles.overlay} />
        <SelectionOverlay dimensions={dimensions} />
        <FloatingActions dimensions={dimensions} />
      </div>
    </main>
  );
}
