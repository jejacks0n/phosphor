<script setup>
import { computed, useTemplateRef, watch, onMounted, onBeforeUnmount } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { ctx2d } from '@/lib/Canvas';
import { charRowsOf, putCellPixels } from '@/lib/Cells';
import { cellKey, ownIndexes } from '@/document/editCells';
import { veilPixels } from '@/lib/ghostCells';
import { viewWindow, viewIn, wholeCellsIn, scrollToCell } from '@/lib/viewWindow';
import { wandIn } from '@/lib/MagicWand';
import WandOverlay from '@/components/WandOverlay.vue';
import { clampZoom, PIXEL_ZOOM_START } from '@/lib/zoom';
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
const zoom = { get: () => workspaceStore.editZoom, set: workspaceStore.setEditZoom, clamp: clampZoom, start: PIXEL_ZOOM_START };

// Every cells layer's cells (or all, with "All cells") drawn over the image as their half-cell colors: the
// ANSI layer at pixel scale. Composed cells already have paint on top, so paint stays visible. A layer's cell that's
// paint to it (a paint block, Colors only's ▄, outside ANSI; a cell Merge down froze over its paint: ownEntry) isn't
// drawn: its paint is the pixels already (docs/model.md R6).
// One bitmap the grid's size, not redrawn on zoom or opacity; when the cells change, only those that
// did are painted again (an edit keeps every other cell the same object), so a stroke costs its own
// cells, not the grid's. A new grid size, or All cells switched, paints it all.
// While an animation plays, the frame playing's own (FrameBuilder); otherwise with its ghost, if it has one: the frame
// before's staying cells typed there (its picture ghost) are drawn as this frame's own are.
// The cells shown and the maps of cells that are someone's own: the frame playing's (one map, every layer's), or the
// drawing's and each cells layer that shows (the one in use is the edit cells, the rest wait in the store's _layerData).
const shownFrame = () => {
  const played = workspaceStore.playing && workspaceStore.played;
  if (played) return { cells: played.cells, maps: [played.editCells] };
  return { cells: projectStore.shownCells, maps: projectStore.ownCellMaps() };
};
const sameMaps = (a, b) => a.length === b.length && a.every((map, i) => map === b[i]);
const overlay = { canvas: null, image: null, cells: null, maps: [], edited: null, all: null, style: null, cols: 0, rows: 0, empty: true };
const updateOverlay = () => {
  const { cols, rows } = projectStore;
  const { cells, maps } = shownFrame();
  const all = workspaceStore.ansiOverlayAll, style = projectStore.renderStyle;
  if (overlay.cells === cells && sameMaps(maps, overlay.maps) && overlay.all === all && overlay.style === style) return;
  const owners = !workspaceStore.playing && cells !== projectStore.cells && projectStore._ghost.owners, plain = projectStore.cells;
  const picture = !!owners?.size;
  const ghost = (i) => plain[i] !== cells[i] && !!owners.get(i)?.built.editCells.has(cellKey(i % cols, Math.floor(i / cols)));

  // The layers' cells, by index (only those in the grid); none asked for while All cells shows every cell (a file's 500k).
  let edited = all ? null : overlay.edited;
  if (!all && (!edited || !sameMaps(maps, overlay.maps) || cols !== overlay.cols || rows !== overlay.rows || style !== overlay.style)) { // indexes are by the grid's width
    edited = ownIndexes(maps, cols, rows, style); // docs/model.md R6
  }
  const shown = (i) => (all || edited.has(i) || (picture && ghost(i)) ? cells[i] ?? null : null);
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
  Object.assign(overlay, { cells, maps, edited, all, style, cols, rows, empty: all ? !cells.length : !edited.size && !picture });
};

// The ghost on the art: what's under the cells that shownCells dims, laid over them. The cells only say which, since
// paint is in the output, not in a cell's colors alone. Worked out again only when they change.
const veil = { canvas: null, shown: null, any: false, art: new WeakMap() };
// A frame near this one's art, read back once (slow on a phone) and kept while it's built the same.
const artOf = (built) => {
  let art = veil.art.get(built);
  if (!art) veil.art.set(built, art = ctx2d(built.output).getImageData(0, 0, projectStore.cols, projectStore.rows).data);
  return art;
};
const drawVeil = (ctx, win, width, height) => {
  const shown = projectStore.shownCells, { cells, cols, rows } = projectStore;
  if (workspaceStore.playing || shown === cells) return;
  if (veil.shown !== shown) {
    // Over the inherited cells, what's under them; over a picture ghost's, its frame's art (opaque as strong as that
    // frame's ghost, and tinted for a frame after).
    const base = projectStore.renderer.basePixels; // read only when it's needed: under Best match it's snapped on asking
    if (!base || base.width !== cols || base.height !== rows) return;
    const owners = projectStore._ghost.owners, inherited = [], pictured = new Map();
    for (let i = 0; i < cells.length; i++) {
      if (shown[i] === cells[i]) continue;
      const picture = owners?.get(i);
      if (picture) (pictured.get(picture) ?? pictured.set(picture, []).get(picture)).push(i);
      else inherited.push(i);
    }
    const image = new ImageData(cols, rows);
    veilPixels(image.data, base.data, inherited, cols, projectStore.ghostStrength);
    // Over a character on the base, what's under is its look, as the view shows it there (docs/model.md R11).
    // ponytail: each inherited cell is asked for its pin, every time the cells change (an animation's 40,000 cells, all
    // inherited over a base that's all pins: 16 to 20 ms); work out only the cells that changed if that shows.
    const params = projectStore.processParams;
    for (const i of inherited) {
      const col = i % cols, row = (i - col) / cols, look = projectStore.renderer.baseLook(col, row, params);
      look?.forEach(({ r, g, b }, half) => image.data.set([r, g, b], 4 * ((2 * row + half) * cols + col)));
    }
    for (const [{ built, strength, tint }, indexes] of pictured) {
      veilPixels(image.data, artOf(built), indexes, cols, 1 - strength, tint);
    }
    veil.canvas ??= document.createElement('canvas');
    veil.canvas.width = cols;
    veil.canvas.height = rows;
    ctx2d(veil.canvas).putImageData(image, 0, 0);
    veil.shown = shown;
  }
  ctx.drawImage(veil.canvas, win.col, win.row, win.cols, win.rows, 0, 0, width, height);
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

// The canvas over its window at a unit (CSS px per grid pixel, across and down).
const place = (dc, win, u) => Object.assign(dc.style, { width: `${win.cols * u.x}px`, height: `${win.rows * u.y}px`, left: `${win.col * u.x}px`, top: `${win.row * u.y}px` });

const redrawDisplay = () => {
  const dc = canvasRef.value, sizer = sizerRef.value;
  const played = workspaceStore.playing && workspaceStore.played?.output;
  const output = played || projectStore.renderer.shownCanvas(); // the upper layers' pixels over it
  if (!dc || !sizer || !viewportEl || !output) return;
  const u = unit.value, view = viewIn(sizer, viewportEl);
  // A grid pixel is a column wide and half a line tall: the whole cells in view, and the zoom they're
  // at, are what a room's watchers are shown. Set only when they changed, so a redraw doesn't send the view again.
  const cells = { ...wholeCellsIn(view, { cellWidth: u.x, lineHeight: 2 * u.y }, projectStore.cols, charRowsOf(projectStore.rows)), zoom: u.x };
  // Not over a room's view that's coming back (restoreView).
  if (workspaceStore.viewToRestore?.tab !== 'input' && Object.keys(cells).some((k) => cells[k] !== workspaceStore.inputView[k])) workspaceStore.inputView = cells;
  const win = viewWindow(view, u, projectStore.cols, projectStore.rows);
  const width = win.cols * u.x, height = win.rows * u.y;
  // Resizing clears the canvas, so only when the window's size changes; otherwise a clear, for an
  // output with transparent pixels.
  const ctx = ctx2d(dc);
  if (dc.width !== Math.ceil(width) || dc.height !== Math.ceil(height)) {
    dc.width = Math.ceil(width);
    dc.height = Math.ceil(height);
  } else {
    ctx.clearRect(0, 0, dc.width, dc.height);
  }
  place(dc, win, u);
  drawnWindow = win;
  ctx.imageSmoothingEnabled = false;
  // Drawn to the backing size, not the CSS size: at a fractional zoom the two differ by under a pixel.
  ctx.drawImage(output, win.col, win.row, win.cols, win.rows, 0, 0, dc.width, dc.height);
  // A character on the base, or an art layer's, as it looks at this scale, over the two colors the pixels hold it as
  // (docs/model.md R11): the Renderer's image of them, kept as the Overlay's is. A frame playing has them in its output.
  const looks = !played && projectStore.renderer.looksCanvas(projectStore.processParams);
  if (looks) ctx.drawImage(looks, win.col, win.row, win.cols, win.rows, 0, 0, dc.width, dc.height);
  drawVeil(ctx, win, dc.width, dc.height);
  drawOverlay(ctx, win, dc.width, dc.height);
};

// A room's view coming back: scrolled to in a redraw's frame, after the viewport's own placing, once the
// art is there: its first cells would center the view (below), and the sizer has its size by then.
const restoreView = () => {
  const to = workspaceStore.viewToRestore, sizer = sizerRef.value;
  if (to?.tab !== 'input' || !sizer || !viewportEl || projectStore.cells.length !== projectStore.cols * charRowsOf(projectStore.rows)) return;
  const u = unit.value;
  const { left, top } = scrollToCell(viewIn(sizer, viewportEl), { cellWidth: u.x, lineHeight: 2 * u.y }, to.col, to.row);
  viewportEl.scrollLeft += left;
  viewportEl.scrollTop += top;
  viewportEl.dispatchEvent(new Event('scroll'));   // now, not next frame: the viewport's first resize, this frame, keeps the place it last heard
  workspaceStore.viewToRestore = null;
};

// One redraw a frame, from whatever asked for it (scrolls, resizes, edits, zoom).
let redrawFrame = null;
const queueRedraw = () => {
  if (redrawFrame) return;
  redrawFrame = requestAnimationFrame(() => {
    redrawFrame = null;
    restoreView();
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
    x: (clientX - rect.left) / unit.value.x,
    y: (clientY - rect.top) / unit.value.y,
  };
};

// CSS px per grid pixel: editZoom across, and down in the drawing's cell shape (pixelAspect: half that in an 8×8 font).
// Even in a font of odd height its pixels are all one height here; only the ANSI view splits a cell unevenly.
const unit = computed(() => ({ x: workspaceStore.editZoom, y: workspaceStore.editZoom * projectStore.pixelAspect }));
const contentSize = computed(() => ({
  width: projectStore.cols * unit.value.x,
  height: projectStore.rows * unit.value.y,
}));

// The Select tool's rectangle: marching ants around its cells (a grid pixel wide, two tall), offset
// while its outline is dragged.
const marquee = computed(() => {
  const sel = workspaceStore.selection, { x, y } = unit.value;
  if (!sel) return null;
  const { dc, dr } = workspaceStore.selectionOffset ?? { dc: 0, dr: 0 };
  return {
    left: `${(sel.c0 + dc) * x}px`, top: `${2 * (sel.r0 + dr) * y}px`,
    width: `${(sel.c1 - sel.c0 + 1) * x}px`, height: `${2 * (sel.r1 - sel.r0 + 1) * y}px`,
  };
});

// The top-left whole cell on screen, where a paste lands with no selection (as ansiViewOrigin is the
// ANSI view's).
const publishOrigin = () => {
  const sizer = sizerRef.value, view = sizer?.closest('article');
  if (!sizer || !view) return;
  const p = sizer.getBoundingClientRect(), v = view.getBoundingClientRect(), u = unit.value;
  const clamp = (n, max) => Math.max(0, Math.min(max, n));
  workspaceStore.pixelViewOrigin = {
    col: clamp(Math.ceil((v.left - p.left) / u.x), projectStore.cols - 1),
    row: clamp(Math.ceil((v.top - p.top) / (2 * u.y)), charRowsOf(projectStore.rows) - 1),
  };
};

// Every render and every paint replaces cells; re-center when the output size changes
// (including when the first render arrives).
const sizeOf = (canvas) => canvas && `${canvas.width}x${canvas.height}`;
let lastOutputSize = sizeOf(projectStore.renderer.outputCanvas); // a remount keeps the restored scroll
watch(() => workspaceStore.played, queueRedraw);
watch(() => projectStore.shownCells, queueRedraw); // the ghost goes on and off with the cells unchanged
watch(() => projectStore.cells, () => {
  queueRedraw();
  const size = sizeOf(projectStore.renderer.outputCanvas);
  if (size && size !== lastOutputSize) {
    lastOutputSize = size;
    if (workspaceStore.viewToRestore?.tab === 'input') return;   // that places it, not the centering
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
watch(unit, (u) => {
  if (drawnWindow && canvasRef.value) place(canvasRef.value, drawnWindow, u);
  queueRedraw();
});
watch(() => [workspaceStore.ansiOverlay, workspaceStore.ansiOverlayAll], queueRedraw);

// A scroll, or a viewport or sizer of a new size, brings other grid pixels into view.
let resizeObserver = null;
onMounted(() => {
  workspaceStore.viewTab = 'input'; // the view a room's watchers are shown
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
      :zoom="zoom"
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
  background-size: v-bind('unit.x + "px"') v-bind('unit.y + "px"');
  background-image:
      linear-gradient(to right, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
      linear-gradient(to right, rgba(0, 0, 0, 0.1) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(0, 0, 0, 0.1) 1px, transparent 1px);
  background-position: 0 0, 0 0, 0.5px 0.5px, 0.5px 0.5px;
}
</style>
