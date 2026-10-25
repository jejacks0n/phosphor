<script setup>
import { computed, useTemplateRef, watch, onMounted, onBeforeUnmount } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { ctx2d } from '@/lib/Canvas';
import { cellsToPixels, charRowsOf } from '@/lib/Cells';
import { parseKey } from '@/document/editCells';
import { viewWindow, viewIn } from '@/lib/viewWindow';
import EditorViewport from '@/components/EditorViewport.vue';

// The PIXEL view: the composited output canvas scaled up by editZoom. The canvas covers only the
// grid pixels in view, plus a margin (viewWindow), inside a sizer the whole grid's size: the sizer
// is the display everything measures against.
const projectStore = useProjectStore();
const workspaceStore = useWorkspaceStore();
const viewport = useTemplateRef('viewport');
const sizerRef = useTemplateRef('sizer');
const canvasRef = useTemplateRef('displayCanvas');

// Edit cells (or all, with "All cells") drawn over the image as their half-cell colors: the
// ANSI layer at pixel scale. Composed cells already have paint on top, so paint stays visible.
// The bitmap is rebuilt only when the cells or what's included change, not on zoom or opacity.
const overlay = { canvas: null, cells: null, editCells: null, all: null, empty: true };
const updateOverlay = () => {
  const { cols, rows, cells, editCells } = projectStore;
  const all = workspaceStore.ansiOverlayAll;
  if (overlay.cells === cells && overlay.editCells === editCells && overlay.all === all) return;
  Object.assign(overlay, { cells, editCells, all });

  let include = () => true;
  if (!all) {
    const edited = new Set();
    for (const key of editCells.keys()) {
      const { col, row } = parseKey(key);
      if (col < cols && row < charRowsOf(rows)) edited.add(row * cols + col);
    }
    include = (i) => edited.has(i);
    overlay.empty = !edited.size;
  } else {
    overlay.empty = !cells.length;
  }
  if (overlay.empty) return;
  if (!overlay.canvas) overlay.canvas = document.createElement('canvas');
  overlay.canvas.width = cols;
  overlay.canvas.height = rows;
  ctx2d(overlay.canvas).putImageData(new ImageData(cellsToPixels(cells, cols, rows, include), cols, rows), 0, 0);
};

const drawOverlay = (ctx, win, width, height) => {
  const opacity = workspaceStore.ansiOverlay / 100;
  if (!opacity || !projectStore.cells.length) return;
  updateOverlay();
  if (overlay.empty) return;
  const overlayCanvas = overlay.canvas;
  ctx.globalAlpha = opacity;
  ctx.drawImage(overlayCanvas, win.col, win.row, win.cols, win.rows, 0, 0, width, height);
  ctx.globalAlpha = 1;
};

// Draws the window of grid pixels around the viewport, against the layout as it is now. Its CSS
// size is exactly the window's (fractional at a fractional zoom); the backing store is whole pixels.
let viewportEl = null;
const redrawDisplay = () => {
  const dc = canvasRef.value, sizer = sizerRef.value;
  const output = projectStore.renderer.outputCanvas;
  if (!dc || !sizer || !viewportEl || !output) return;
  const zoom = workspaceStore.editZoom;
  const win = viewWindow(viewIn(sizer, viewportEl), { x: zoom, y: zoom }, projectStore.cols, projectStore.rows);
  const width = win.cols * zoom, height = win.rows * zoom;
  // Resizing clears the canvas, so only when the window's size changes; otherwise a clear, for an
  // output with transparent pixels.
  const ctx = ctx2d(dc);
  if (dc.width !== Math.ceil(width) || dc.height !== Math.ceil(height)) {
    dc.width = Math.ceil(width);
    dc.height = Math.ceil(height);
  } else {
    ctx.clearRect(0, 0, dc.width, dc.height);
  }
  Object.assign(dc.style, { width: `${width}px`, height: `${height}px`, left: `${win.col * zoom}px`, top: `${win.row * zoom}px` });
  ctx.imageSmoothingEnabled = false;
  // Drawn to the backing size, not the CSS size: at a fractional zoom the two differ by under a pixel.
  ctx.drawImage(output, win.col, win.row, win.cols, win.rows, 0, 0, dc.width, dc.height);
  drawOverlay(ctx, win, dc.width, dc.height);
};

// One redraw a frame, from whatever asked for it (scrolls, resizes, edits, zoom).
let redrawFrame = null;
const queueRedraw = () => {
  if (redrawFrame) return;
  redrawFrame = requestAnimationFrame(() => {
    redrawFrame = null;
    redrawDisplay();
  });
};

const coordsAt = (event) => {
  const displayEl = sizerRef.value;
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

// Every render and every paint replaces cells; re-center when the output size changes
// (including when the first render arrives).
const sizeOf = (canvas) => canvas && `${canvas.width}x${canvas.height}`;
let lastOutputSize = sizeOf(projectStore.renderer.outputCanvas); // a remount keeps the restored scroll
watch(() => projectStore.cells, () => {
  queueRedraw();
  const size = sizeOf(projectStore.renderer.outputCanvas);
  if (size && size !== lastOutputSize) {
    lastOutputSize = size;
    requestAnimationFrame(() => {
      viewport.value?.centerContent();
      redrawDisplay(); // the window was placed against the scroll from before the centering
    });
  }
});
// Queued, not drawn at once: a zoom lands here before Vue has given the sizer its new size and the
// padded layout has re-centered, so a window placed now would be placed against the old layout.
watch(() => [workspaceStore.editZoom, workspaceStore.ansiOverlay, workspaceStore.ansiOverlayAll], queueRedraw);

// A scroll, or a viewport or sizer of a new size, brings other grid pixels into view.
let resizeObserver = null;
onMounted(() => {
  viewportEl = sizerRef.value?.closest('article') ?? null;
  viewportEl?.addEventListener('scroll', queueRedraw, { passive: true });
  resizeObserver = new ResizeObserver(queueRedraw);
  if (viewportEl) resizeObserver.observe(viewportEl);
  if (sizerRef.value) resizeObserver.observe(sizerRef.value);
  redrawDisplay();
  queueRedraw(); // after the viewport's scroll restore, which was queued first
});

onBeforeUnmount(() => {
  if (redrawFrame) cancelAnimationFrame(redrawFrame);
  viewportEl?.removeEventListener('scroll', queueRedraw);
  resizeObserver?.disconnect();
});
</script>

<template>
  <EditorViewport
      ref="viewport"
      :display="sizerRef"
      :coords-at="coordsAt"
      zoomable
      scroll-key="input"
      :content-size="contentSize"
      view="input"
      :unit="unit"
  >
    <!-- Sized to exactly cols*zoom (fractional at a fractional zoom): coordinates, the brush preview
         and the viewport layout all assume the exact size. -->
    <div ref="sizer" class="display" :style="{ width: `${contentSize.width}px`, height: `${contentSize.height}px` }">
      <canvas ref="displayCanvas"/>
    </div>
    <div v-if="workspaceStore.editZoom >= 16" class="grid-overlay"></div>
  </EditorViewport>
</template>

<style scoped>
div.display {
  position: relative;
  outline: 2px dashed var(--border-light);
}

.display canvas {
  position: absolute;
  display: block;
  image-rendering: pixelated;
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
