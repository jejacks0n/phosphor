<script setup>
import { computed, useTemplateRef, watch, onMounted, onBeforeUnmount } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { ctx2d } from '@/lib/Canvas';
import { charRowsOf, putCellPixels } from '@/lib/Cells';
import { parseKey } from '@/document/editCells';
import { viewWindow, viewIn } from '@/lib/viewWindow';
import { wandIn } from '@/lib/MagicWand';
import WandOverlay from '@/components/WandOverlay.vue';
import EditorViewport from '@/components/EditorViewport.vue';

// The PIXEL view: the composited output canvas scaled up by editZoom. The canvas covers only the
// grid pixels in view, plus a margin (viewWindow), inside a sizer the whole grid's size: the sizer
// is the display everything measures against.
const projectStore = useProjectStore();
const workspaceStore = useWorkspaceStore();
// The Magic Wand's selection, made in either view, in this view's units.
const wand = computed(() => workspaceStore.wand && wandIn(workspaceStore.wand, 'input', projectStore.rows));
const viewport = useTemplateRef('viewport');
const sizerRef = useTemplateRef('sizer');
const canvasRef = useTemplateRef('displayCanvas');

// Edit cells (or all, with "All cells") drawn over the image as their half-cell colors: the
// ANSI layer at pixel scale. Composed cells already have paint on top, so paint stays visible.
// One bitmap the grid's size, not redrawn on zoom or opacity; when the cells change, only those that
// did are painted again (an edit keeps every other cell the same object), so a stroke costs its own
// cells, not the grid's. A new grid size, or All cells switched, paints it all.
const overlay = { canvas: null, image: null, cells: null, editCells: null, edited: new Set(), all: null, cols: 0, rows: 0, empty: true };
const updateOverlay = () => {
  const { cols, rows, cells, editCells } = projectStore;
  const all = workspaceStore.ansiOverlayAll;
  if (overlay.cells === cells && overlay.editCells === editCells && overlay.all === all) return;

  // The edit cells, by index (only those in the grid).
  let edited = overlay.edited;
  if (editCells !== overlay.editCells || cols !== overlay.cols || rows !== overlay.rows) { // indexes are by the grid's width
    edited = new Set();
    for (const key of editCells.keys()) {
      const { col, row } = parseKey(key);
      if (col < cols && row < charRowsOf(rows)) edited.add(row * cols + col);
    }
  }
  const shown = (i) => (all || edited.has(i) ? cells[i] ?? null : null);
  const whole = !overlay.image || overlay.cols !== cols || overlay.rows !== rows || overlay.all !== all || overlay.cells?.length !== cells.length;
  if (whole) {
    overlay.canvas ??= document.createElement('canvas');
    overlay.canvas.width = cols;
    overlay.canvas.height = rows;
    overlay.image = new ImageData(cols, rows);
    for (let i = 0; i < cells.length; i++) if (shown(i)) putCellPixels(overlay.image.data, cols, i, cells[i]);
    ctx2d(overlay.canvas).putImageData(overlay.image, 0, 0);
  } else {
    // Cells that are new objects, and cells that became or stopped being edit cells.
    const changed = [];
    if (cells !== overlay.cells) for (let i = 0; i < cells.length; i++) if (cells[i] !== overlay.cells[i]) changed.push(i);
    if (!all && edited !== overlay.edited) {
      for (const i of edited) if (!overlay.edited.has(i)) changed.push(i);
      for (const i of overlay.edited) if (!edited.has(i)) changed.push(i);
    }
    let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
    for (const i of changed) {
      putCellPixels(overlay.image.data, cols, i, shown(i));
      const col = i % cols, row = (i - col) / cols;
      x0 = Math.min(x0, col); x1 = Math.max(x1, col); y0 = Math.min(y0, 2 * row); y1 = Math.max(y1, 2 * row + 1);
    }
    if (changed.length) ctx2d(overlay.canvas).putImageData(overlay.image, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }
  Object.assign(overlay, { cells, editCells, edited, all, cols, rows, empty: all ? !cells.length : !edited.size });
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
let drawnWindow = null; // the window the canvas holds, from the last redraw

// The canvas over its window at a zoom: CSS px.
const place = (dc, win, zoom) => Object.assign(dc.style, { width: `${win.cols * zoom}px`, height: `${win.rows * zoom}px`, left: `${win.col * zoom}px`, top: `${win.row * zoom}px` });

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
  place(dc, win, zoom);
  drawnWindow = win;
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
    publishOrigin();
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

// The Select tool's rectangle: marching ants around its cells (a grid pixel wide, two tall), offset
// while its outline is dragged.
const marquee = computed(() => {
  const sel = workspaceStore.selection, z = workspaceStore.editZoom;
  if (!sel) return null;
  const { dc, dr } = workspaceStore.selectionOffset ?? { dc: 0, dr: 0 };
  return {
    left: `${(sel.c0 + dc) * z}px`, top: `${2 * (sel.r0 + dr) * z}px`,
    width: `${(sel.c1 - sel.c0 + 1) * z}px`, height: `${2 * (sel.r1 - sel.r0 + 1) * z}px`,
  };
});

// The top-left whole cell on screen, where a paste lands with no selection (as ansiViewOrigin is the
// ANSI view's).
const publishOrigin = () => {
  const sizer = sizerRef.value, view = sizer?.closest('article');
  if (!sizer || !view) return;
  const p = sizer.getBoundingClientRect(), v = view.getBoundingClientRect(), z = workspaceStore.editZoom;
  const clamp = (n, max) => Math.max(0, Math.min(max, n));
  workspaceStore.pixelViewOrigin = {
    col: clamp(Math.ceil((v.left - p.left) / z), projectStore.cols - 1),
    row: clamp(Math.ceil((v.top - p.top) / (2 * z)), charRowsOf(projectStore.rows) - 1),
  };
};

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
// padded layout has re-centered, so a window placed now would be placed against the old layout. But
// the canvas already drawn is scaled to the new zoom at once, as the sizer is: a frame painted before
// the redraw (a pinch on a phone can land late in a frame) shows it where it belongs, a little soft,
// rather than out of line with everything around it (a flicker on every step of a fast zoom).
watch(() => workspaceStore.editZoom, (zoom) => {
  if (drawnWindow && canvasRef.value) place(canvasRef.value, drawnWindow, zoom);
  queueRedraw();
});
watch(() => [workspaceStore.ansiOverlay, workspaceStore.ansiOverlayAll], queueRedraw);

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
    <div ref="sizer" class="display pixel-display" :style="{ width: `${contentSize.width}px`, height: `${contentSize.height}px` }">
      <canvas ref="displayCanvas"/>
      <div v-if="marquee" class="pixel-marquee" :style="marquee"></div>
    </div>
    <div v-if="workspaceStore.editZoom >= 16" class="grid-overlay"></div>
    <template #overlay>
      <WandOverlay v-if="wand" :wand="wand" :unit="unit" :display="sizerRef" :tint="workspaceStore.activeTool === 'wand'"/>
    </template>
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

.pixel-marquee {
  position: absolute;
  box-sizing: border-box;
  pointer-events: none;
  z-index: 1;
  /* The Magic Wand's line: white dashes over black, one pixel, inside the box. */
  border: 1px solid black;
  outline: 1px dashed white;
  outline-offset: -1px;
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
