<script setup>
import { ref, computed, useTemplateRef, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useTextTool } from '@/composables/useTextTool';
import { render as renderText } from '@/lib/TextRenderer';
import { getContext, calcMetrics } from '@/lib/AnsiRuntime';
import { charRowsOf } from '@/lib/Cells';
import CellCanvas from '@/lib/CellCanvas';
import { viewWindow, viewIn, wholeCellsIn, scrollToCell } from '@/lib/viewWindow';
import { wandIn } from '@/lib/MagicWand';
import WandOverlay from '@/components/WandOverlay.vue';
import { clampAnsiZoom } from '@/lib/zoom';
import { fitColumns } from '@/lib/DrawnWidth';
import EditorViewport from '@/components/EditorViewport.vue';
import AnsiStatusBar from '@/components/AnsiStatusBar.vue';

// The ANSI view: cells drawn on a canvas (CellCanvas), or rendered as text in a <pre> (the DOM
// renderer, kept beside it for the trial: workspace.ansiRenderer); a grid pixel is half a
// character cell tall. The canvas covers only the cells in view, plus a margin (viewWindow), inside
// a sizer the whole grid's size: the sizer is the display everything measures against. It zooms out
// (workspace.ansiZoom): the canvas draws its glyphs at the zoom, the <pre> its font.
const projectStore = useProjectStore();
const workspaceStore = useWorkspaceStore();
// The Magic Wand's selection, made in either view, in this view's units.
const wand = computed(() => workspaceStore.wand && wandIn(workspaceStore.wand, 'output', projectStore.rows));
const textInputRef = useTemplateRef('textInput');
useTextTool(projectStore, workspaceStore, textInputRef);
const useDom = computed(() => workspaceStore.ansiRenderer === 'dom');
const preRef = useTemplateRef('pre'), canvasRef = useTemplateRef('canvas'), sizerRef = useTemplateRef('sizer');
const displayRef = computed(() => (useDom.value ? preRef.value : sizerRef.value));

const metrics = ref(null);
// The sizer's size comes from the last metrics a render used, which nothing clears: metrics is
// nulled while a grid, font or renderer change is measured again, and a sizer that followed it
// would collapse for a layout, and the browser would clamp the scroll to 0.
const sizedBy = ref(null);
const sizerStyle = computed(() => {
  const m = sizedBy.value;
  if (!m) return { pointerEvents: 'none' };
  return { pointerEvents: 'none', width: `${projectStore.cols * m.cellWidth}px`, height: `${charRowsOf(projectStore.rows) * m.lineHeight}px` };
});
let renderFrame = null;
let cellCanvas = null;

// The canvas renderer for the mounted canvas. No WebGL2: the DOM view instead.
const ensureCellCanvas = () => {
  if (cellCanvas?.canvas === canvasRef.value) return cellCanvas;
  cellCanvas?.destroy();
  try {
    cellCanvas = new CellCanvas(canvasRef.value, { onRestored: queueRender });
    cellCanvas.smooth = workspaceStore.smoothText;
  } catch (error) {
    console.warn('The ANSI view\'s canvas renderer is unavailable; using the DOM view.', error);
    cellCanvas = null;
    workspaceStore.ansiRenderer = 'dom';
  }
  return cellCanvas;
};

// Character cell size in CSS px at the zoom (null until it can be measured): measured from the
// <pre>'s font, or the canvas renderer's whole-device-pixel cells (at the full dpr until a render
// has sized the canvas for its window, which can cap it).
const ensureMetrics = () => {
  if (metrics.value) return metrics.value;
  if (useDom.value) {
    if (displayRef.value) metrics.value = calcMetrics(displayRef.value);
  } else if (canvasRef.value && ensureCellCanvas()) {
    metrics.value = cellCanvas.cellSize(window.devicePixelRatio, workspaceStore.ansiZoom);
  }
  return metrics.value;
};

const queueRender = () => {
  if (renderFrame) return;
  renderFrame = requestAnimationFrame(() => {
    renderFrame = null;
    render();
  });
};

// A new cell size (a font, its size, the dpr) scales the display: the view keeps the point at its
// center where it was in the art. Read before the display takes its new size, and scrolled once it
// has. Then the canvas is drawn at once: the render that called this placed its window by the old
// scroll, and waiting for the scroll's redraw would paint a frame of empty sizer.
const keepPlace = (was) => {
  const display = displayRef.value, view = viewIn(display, viewportEl);
  const col = (view.x + view.width / 2) / was.cellWidth, line = (view.y + view.height / 2) / was.lineHeight;
  nextTick(() => {
    const m = ensureMetrics();
    if (!viewportEl || displayRef.value !== display || !m) return;
    const now = viewIn(display, viewportEl);
    viewportEl.scrollLeft += col * m.cellWidth - (now.x + now.width / 2);
    viewportEl.scrollTop += line * m.lineHeight - (now.y + now.height / 2);
    if (!useDom.value) render(); // the cell size is the sizer's by now, so this doesn't come back here
  });
};

// The zoom, from a gesture (Ctrl+wheel, a pinch, the Zoom tool) or the status bar. The new cell
// size is the sizer's at once, before the gesture's next frame puts the point under the pointer
// back, and the canvas is drawn after that. A gesture places the view itself; any other zoom keeps
// the view's middle. The zoom isn't a new cell size to the render: it changes the sizer first.
let zoomGesture = false;
const zoom = {
  get: () => workspaceStore.ansiZoom,
  set: (z) => {
    zoomGesture = true;
    workspaceStore.setAnsiZoom(z);
    nextTick(() => { zoomGesture = false; }); // after the watcher below, which a change queues
  },
  clamp: clampAnsiZoom,
};
watch(() => workspaceStore.ansiZoom, (z) => {
  const was = metrics.value ?? sizedBy.value;
  metrics.value = null;
  if (!useDom.value && cellCanvas) metrics.value = sizedBy.value = cellCanvas.cellSize(window.devicePixelRatio, z);
  if (!zoomGesture && was && viewportEl && displayRef.value) keepPlace(was);
  drawInView();
});

// The canvas view draws the window of cells around the viewport, against the layout as it is now:
// a change that moves or resizes the sizer (a font, the grid, a panel) is drawn again by the resize
// observer, after its layout. After a remount the scroll is restored a frame late (EditorViewport),
// so mount queues a second render, drawn after the restore.
const render = () => {
  if (!projectStore.cells.length || !displayRef.value) return;

  let m = ensureMetrics();
  if (!m || m.cellWidth === 0 || m.lineHeight === 0) {
    metrics.value = null;
    queueRender();
    return;
  }
  if (workspaceStore.viewToRestore?.tab === 'output') publishOrigin();   // once this has laid out

  if (!useDom.value) {
    if (!ensureCellCanvas() || !viewportEl) return;
    const cols = projectStore.cols, lines = charRowsOf(projectStore.rows), dpr = window.devicePixelRatio;
    // The window's size can change the cell (the backing scale is capped by the canvas's area), and
    // the cell the window's size; cells are whole device px, so it settles in a pass or two. The
    // overlays follow through metrics.
    let win;
    for (let pass = 0; pass < 3; pass++) {
      win = viewWindow(viewIn(sizerRef.value, viewportEl), { x: m.cellWidth, y: m.lineHeight }, cols, lines);
      cellCanvas.resize(win.cols, win.rows, dpr, workspaceStore.ansiZoom);
      const sized = cellCanvas.metrics;
      if (sized.cellWidth === m.cellWidth && sized.lineHeight === m.lineHeight) break;
      m = metrics.value = sized;
    }
    const was = sizedBy.value;
    sizedBy.value = m;
    if (was && (was.cellWidth !== m.cellWidth || was.lineHeight !== m.lineHeight)) keepPlace(was);
    cellCanvas.draw(projectStore.cells, { cols, rows: lines, col: win.col, row: win.row });
    canvasRef.value.style.left = `${win.col * m.cellWidth}px`;
    canvasRef.value.style.top = `${win.row * m.lineHeight}px`;
    return;
  }

  const context = getContext({
    element: displayRef.value,
    cols: projectStore.cols,
    rows: charRowsOf(projectStore.rows),
  }, m);

  const buffer = projectStore.cells.map(({ char, fg, bg, wide }) => ({
    char: wide === 'trail' ? '' : char, // the lead's glyph is the whole wide character
    fit: wide === 'trail' ? 0 : fitColumns(char), // held to its columns, its shape spilling over what follows
    color: fg.hex,
    backgroundColor: bg.hex,
    fgIndex: fg.c,
    bgIndex: bg.c,
  }));
  renderText(context, buffer);
};

const coordsAt = (event) => {
  const displayEl = displayRef.value;
  const m = ensureMetrics();
  if (!displayEl || !m) return null;
  const rect = displayEl.getBoundingClientRect();
  const clientX = event.touches ? event.touches[0].clientX : event.clientX;
  const clientY = event.touches ? event.touches[0].clientY : event.clientY;
  // Measured from inside the display's border, where the cells start.
  return {
    x: (clientX - rect.left - displayEl.clientLeft) / m.cellWidth,
    y: (clientY - rect.top - displayEl.clientTop) / (m.lineHeight / 2),
  };
};

// CSS px per grid pixel (a grid pixel is half a character cell tall), for tool previews.
const unit = computed(() => (metrics.value ? { x: metrics.value.cellWidth, y: metrics.value.lineHeight / 2 } : null));

// CSS px per cell, for the Magic Wand's overlay.
const cellUnit = computed(() => (metrics.value ? { x: metrics.value.cellWidth, y: metrics.value.lineHeight } : null));

// A cell's top-left in the overlays, inside the display's border where the cells start.
const cellOrigin = (m, col, row) => ({
  left: `${col * m.cellWidth + (displayRef.value?.clientLeft ?? 0)}px`,
  top: `${row * m.lineHeight + (displayRef.value?.clientTop ?? 0)}px`,
});

// The Text tool's cursor: a blinking outline on its cell.
const cursorStyle = computed(() => {
  const m = metrics.value, cursor = workspaceStore.textCursor;
  if (!m || !cursor || workspaceStore.activeTool !== 'text') return { display: 'none' };
  return {
    display: 'block',
    width: `${m.cellWidth}px`,
    height: `${m.lineHeight}px`,
    ...cellOrigin(m, cursor.col, cursor.row),
  };
});

// The Text tool's textarea sits on the cursor's cell, so an input method's candidates open there.
const textInputStyle = computed(() => {
  const m = metrics.value, cursor = workspaceStore.textCursor;
  if (!m || !cursor) return { left: '0px', top: '0px' };
  return { ...cellOrigin(m, cursor.col, cursor.row), height: `${m.lineHeight}px` };
});

// The view follows the Text tool's cursor, like a text editor: when it moves (the arrow keys,
// typing, a paste) past the visible area, the view scrolls just enough to keep it in sight, with a
// margin around it (the cursor's scroll-margin). Nothing scrolls while it's already in view.
const cursorRef = useTemplateRef('cursor');
watch(() => workspaceStore.textCursor, (cursor) => {
  if (!cursor || workspaceStore.activeTool !== 'text') return;
  cursorRef.value?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}, { flush: 'post' });

// The selection: marching ants, offset while it's being dragged. Its actions are on the options row.
const selectionBox = computed(() => {
  const m = metrics.value, sel = workspaceStore.selection;
  if (!m || !sel) return null;
  const { dc, dr } = workspaceStore.selectionOffset ?? { dc: 0, dr: 0 };
  return {
    marquee: { ...cellOrigin(m, sel.c0 + dc, sel.r0 + dr), width: `${(sel.c1 - sel.c0 + 1) * m.cellWidth}px`, height: `${(sel.r1 - sel.r0 + 1) * m.lineHeight}px` },
  };
});

// The first content renders immediately so it's laid out before the viewport restores/centers its
// scroll on the next frame; later updates (e.g. every paint move) coalesce to one render per frame.
watch(() => projectStore.cells, () => ((useDom.value ? displayRef.value?.childElementCount : cellCanvas) ? queueRender() : render()));
watch(() => [projectStore.cols, projectStore.rows], () => {
  metrics.value = null;
  queueRender();
});
// Swapping renderers: the overlays measure against the new element once it's mounted. The canvas
// renderer's WebGL context goes with its canvas.
watch(useDom, (dom) => {
  if (dom) {
    cellCanvas?.destroy();
    cellCanvas = null;
  }
  metrics.value = null;
  nextTick(queueRender);
});

// Smooth or sharp text: the canvas's glyphs are drawn again.
watch(() => workspaceStore.smoothText, (smooth) => {
  if (!cellCanvas) return;
  cellCanvas.smooth = smooth;
  queueRender();
});

// A new display font, now loaded: the canvas's glyphs and the cell size are measured again.
watch(() => workspaceStore.displayFontLoaded, () => {
  cellCanvas?.invalidate();
  metrics.value = null;
  queueRender();
});

// A room's view coming back: scrolled to once the art is laid out at its final cell size (the sizer's, or
// the <pre>'s cells, in the display font). False until then, when nothing's published over the kept view.
const restoreView = (display, m) => {
  const to = workspaceStore.viewToRestore;
  if (to?.tab !== 'output') return true;
  const sized = useDom.value ? display.childElementCount : sizedBy.value?.cellWidth === m.cellWidth && sizedBy.value.lineHeight === m.lineHeight;
  if (!sized || !workspaceStore.displayFontLoaded || projectStore.cells.length !== projectStore.cols * charRowsOf(projectStore.rows)) return false;
  const { left, top } = scrollToCell(viewIn(display, viewportEl), m, to.col, to.row);
  viewportEl.scrollLeft += left;
  viewportEl.scrollTop += top;
  workspaceStore.viewToRestore = null;
  return true;
};

// The first whole cell on screen (top-left), where a paste goes with no selection or text cursor.
let originFrame = 0;
let viewportEl = null;
let resizeObserver = null;
const publishOrigin = () => {
  cancelAnimationFrame(originFrame);
  originFrame = requestAnimationFrame(() => {
    const display = displayRef.value, m = ensureMetrics();
    if (!display || !m || !viewportEl || !restoreView(display, m)) return;
    const { col, row, cols, rows } = wholeCellsIn(viewIn(display, viewportEl), m, projectStore.cols, charRowsOf(projectStore.rows));
    workspaceStore.ansiViewOrigin = { col, row };
    workspaceStore.ansiViewSize = { cols, rows };
    workspaceStore.ansiViewZoom = workspaceStore.ansiZoom;   // the zoom these cells are at, for a room's watchers
  });
};
watch([metrics, () => projectStore.cols, () => projectStore.rows], publishOrigin);

// The canvas view draws what's in view, so a scroll, or a viewport or sizer of a new size, draws
// again. Not the DOM view: its render rebuilds every cell, too much for every scroll frame.
const drawInView = () => {
  if (!useDom.value) queueRender();
};
watch(sizerRef, (sizer, old) => {
  if (old) resizeObserver?.unobserve(old);
  if (sizer) resizeObserver?.observe(sizer);
});

onMounted(() => {
  workspaceStore.viewTab = 'output'; // the view a room's watchers are shown
  viewportEl = displayRef.value?.closest('article') ?? null;
  viewportEl?.addEventListener('scroll', publishOrigin, { passive: true });
  viewportEl?.addEventListener('scroll', drawInView, { passive: true });
  window.addEventListener('resize', publishOrigin);
  resizeObserver = new ResizeObserver(drawInView);
  if (viewportEl) resizeObserver.observe(viewportEl);
  if (sizerRef.value) resizeObserver.observe(sizerRef.value);
  publishOrigin();
  render(); // same reason as the cells watcher: lay out before the viewport's scroll restore
  queueRender(); // and again after it, so the restored scroll is drawn
  if (document.fonts) {
    document.fonts.ready.then(() => {
      if (!displayRef.value) return; // unmounted meanwhile
      cellCanvas?.invalidate(); // glyphs rasterized in a fallback font
      metrics.value = null;
      queueRender();
    });
  }
});

onBeforeUnmount(() => {
  if (renderFrame) cancelAnimationFrame(renderFrame);
  cancelAnimationFrame(originFrame);
  cellCanvas?.destroy();
  viewportEl?.removeEventListener('scroll', publishOrigin);
  viewportEl?.removeEventListener('scroll', drawInView);
  window.removeEventListener('resize', publishOrigin);
  resizeObserver?.disconnect();
});
</script>

<template>
  <div class="ansi-editor" :style="{ '--ansi-zoom': workspaceStore.ansiZoom }">
  <EditorViewport
      :display="displayRef"
      :coords-at="coordsAt"
      :zoom="zoom"
      scroll-key="ansi"
      view="output"
      :unit="unit"
  >
    <pre v-if="useDom" ref="pre" class="display" :style="{ pointerEvents: 'none' }"></pre>
    <div v-else ref="sizer" class="display" :style="sizerStyle"><canvas ref="canvas"></canvas></div>
    <div class="interaction-overlay"></div>
    <template #overlay>
      <div ref="cursor" class="text-cursor" :style="cursorStyle"></div>
      <textarea
          ref="textInput"
          class="text-input"
          data-text-input
          :style="textInputStyle"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          aria-label="Type into the canvas"
      ></textarea>
      <WandOverlay v-if="wand" :wand="wand" :unit="cellUnit" :display="displayRef" :tint="workspaceStore.activeTool === 'wand'"/>
      <template v-if="selectionBox">
        <div class="marquee" :style="selectionBox.marquee"></div>
      </template>
    </template>
  </EditorViewport>
  <AnsiStatusBar/>
  </div>
</template>

<style scoped>
div.ansi-editor {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.marquee {
  position: absolute;
  box-sizing: border-box;
  pointer-events: none;
  z-index: 1001;
  /* The Magic Wand's line: white dashes over black, one pixel, inside the box. */
  border: 1px solid black;
  outline: 1px dashed white;
  outline-offset: -1px;
}

.text-input {
  position: absolute;
  width: 1px;
  padding: 0;
  border: 0;
  margin: 0;
  opacity: 0;
  resize: none;
  overflow: hidden;
  pointer-events: none;
  font: calc(var(--display-font-size) * var(--ansi-zoom)) var(--display-font-family);
}

.text-cursor {
  position: absolute;
  box-sizing: border-box;
  scroll-margin: 40px 60px; /* the view keeps this much room around the cursor when it follows it */
  pointer-events: none;
  border: 2px solid white;
  mix-blend-mode: difference;
  z-index: 1001;
  animation: text-cursor-blink 1s steps(1) infinite;
}

@keyframes text-cursor-blink {
  50% { opacity: 0; }
}

.interaction-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
}

.display {
  /* the current display font (displayFonts.js) at the zoom, which everything measures in (the line
     height is a multiple of it) */
  font-family: var(--display-font-family);
  font-size: calc(var(--display-font-size) * var(--ansi-zoom));
  line-height: var(--display-line-height);
  -webkit-font-smoothing: var(--display-font-smoothing, antialiased);
  -moz-osx-font-smoothing: var(--display-moz-font-smoothing, grayscale);
  background: var(--surface-dark);
  border: 2px dashed var(--border-light);
  display: block;
  user-select: none;
  -webkit-user-select: none;
}

/* The DOM view: a character held to its columns (TextRenderer's span.fit), as a terminal keeps its
   grid. Its shape spills over the cells after it, on top of them, without changing the row's height. */
.display :deep(span.fit) {
  display: inline-block;
  height: 1lh;
  vertical-align: top;
  position: relative;
  z-index: 1;
  white-space: pre;
}

/* The canvas view's sizer: the whole grid's size, with the canvas at the window in view. An area
   not drawn yet shows the sizer's dark surface. */
div.display {
  position: relative;
}

/* crisp when the backing scale is capped below the dpr (CellCanvas) */
.display canvas {
  position: absolute;
  display: block;
  image-rendering: pixelated;
}

pre {
  margin: 0;
  padding: 0;
  white-space: pre;
  text-rendering: optimizeSpeed;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
  -webkit-text-size-adjust: none;
}
</style>
