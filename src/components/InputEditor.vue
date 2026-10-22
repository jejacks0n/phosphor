<script setup>
import { computed, useTemplateRef, watch, onMounted } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { ctx2d } from '@/lib/Canvas';
import { cellsToPixels, charRowsOf } from '@/lib/Cells';
import { parseKey } from '@/document/cellEdits';
import EditorViewport from '@/components/EditorViewport.vue';

// The PIXEL view: the composited output canvas scaled up by editZoom.
const projectStore = useProjectStore();
const workspaceStore = useWorkspaceStore();
const viewport = useTemplateRef('viewport');
const displayRef = useTemplateRef('displayCanvas');

// Authored cells (or all, with "All cells") drawn over the image as their half-cell colours: the
// ANSI layer at pixel scale. Composed cells already have paint on top, so paint stays visible.
// The bitmap is rebuilt only when the cells or what's included change, not on zoom or opacity.
const overlay = { canvas: null, cells: null, cellEdits: null, all: null, empty: true };
const updateOverlay = () => {
  const { cols, rows, cells, cellEdits } = projectStore;
  const all = workspaceStore.ansiOverlayAll;
  if (overlay.cells === cells && overlay.cellEdits === cellEdits && overlay.all === all) return;
  Object.assign(overlay, { cells, cellEdits, all });

  let include = () => true;
  if (!all) {
    const authored = new Set();
    for (const key of cellEdits.keys()) {
      const { col, row } = parseKey(key);
      if (col < cols && row < charRowsOf(rows)) authored.add(row * cols + col);
    }
    include = (i) => authored.has(i);
    overlay.empty = !authored.size;
  } else {
    overlay.empty = !cells.length;
  }
  if (overlay.empty) return;
  if (!overlay.canvas) overlay.canvas = document.createElement('canvas');
  overlay.canvas.width = cols;
  overlay.canvas.height = rows;
  ctx2d(overlay.canvas).putImageData(new ImageData(cellsToPixels(cells, cols, rows, include), cols, rows), 0, 0);
};

const drawOverlay = (ctx, width, height) => {
  const opacity = workspaceStore.ansiOverlay / 100;
  if (!opacity || !projectStore.cells.length) return;
  updateOverlay();
  if (overlay.empty) return;
  const overlayCanvas = overlay.canvas;
  ctx.globalAlpha = opacity;
  ctx.drawImage(overlayCanvas, 0, 0, width, height);
  ctx.globalAlpha = 1;
};

const redrawDisplay = () => {
  const dc = displayRef.value;
  const output = projectStore.renderer.outputCanvas;
  if (!dc || !output) return;
  dc.width = projectStore.cols * workspaceStore.editZoom;
  dc.height = projectStore.rows * workspaceStore.editZoom;
  const ctx = ctx2d(dc);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(output, 0, 0, dc.width, dc.height);
  drawOverlay(ctx, dc.width, dc.height);
};

const coordsAt = (event) => {
  const displayEl = displayRef.value;
  if (!displayEl) return null;
  const rect = displayEl.getBoundingClientRect();
  const clientX = event.touches ? event.touches[0].clientX : event.clientX;
  const clientY = event.touches ? event.touches[0].clientY : event.clientY;
  return {
    x: (clientX - rect.left) / workspaceStore.editZoom,
    y: (clientY - rect.top) / workspaceStore.editZoom,
  };
};

const contentSize = computed(() => ({
  width: projectStore.cols * workspaceStore.editZoom,
  height: projectStore.rows * workspaceStore.editZoom,
}));
const unit = computed(() => ({ x: workspaceStore.editZoom, y: workspaceStore.editZoom }));

// Every render and every paint replaces cells; re-centre when the output size changes
// (including when the first render arrives).
const sizeOf = (canvas) => canvas && `${canvas.width}x${canvas.height}`;
let lastOutputSize = sizeOf(projectStore.renderer.outputCanvas); // a remount keeps the restored scroll
watch(() => projectStore.cells, () => {
  redrawDisplay();
  const size = sizeOf(projectStore.renderer.outputCanvas);
  if (size && size !== lastOutputSize) {
    lastOutputSize = size;
    requestAnimationFrame(() => viewport.value?.centerContent());
  }
});
watch(() => [workspaceStore.editZoom, workspaceStore.ansiOverlay, workspaceStore.ansiOverlayAll], redrawDisplay);

onMounted(redrawDisplay);
</script>

<template>
  <EditorViewport
      ref="viewport"
      :display="displayRef"
      :coords-at="coordsAt"
      zoomable
      scroll-key="input"
      :content-size="contentSize"
      view="input"
      :unit="unit"
  >
    <!-- Sized in CSS to exactly cols*zoom: the backing store is whole pixels, but coordinates, the
         brush preview and the viewport layout all assume the exact (fractional) size. -->
    <canvas ref="displayCanvas" :style="{ width: `${contentSize.width}px`, height: `${contentSize.height}px` }"/>
    <div v-if="workspaceStore.editZoom >= 16" class="grid-overlay"></div>
  </EditorViewport>
</template>

<style scoped>
canvas {
  display: block;
  image-rendering: pixelated;
  outline: 2px dashed var(--border-light);
}

div.grid-overlay {
  position: absolute;
  inset: 0;
  top: -1px;
  left: -1px;
  pointer-events: none;
  background-size: v-bind('workspaceStore.editZoom + "px"') v-bind('workspaceStore.editZoom + "px"');
  background-image:
      linear-gradient(to right, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
      linear-gradient(to right, rgba(0, 0, 0, 0.1) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(0, 0, 0, 0.1) 1px, transparent 1px);
  background-position: 0 0, 0 0, 0.5px 0.5px, 0.5px 0.5px;
}
</style>
