<script setup>
import { ref, computed, useTemplateRef, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useTextTool } from '@/composables/useTextTool';
import { render as renderText } from '@/lib/TextRenderer';
import { getContext, calcMetrics } from '@/lib/AnsiRuntime';
import { charRowsOf } from '@/lib/Cells';
import CellCanvas from '@/lib/CellCanvas';
import { fitColumns } from '@/lib/DrawnWidth';
import EditorViewport from '@/components/EditorViewport.vue';
import AnsiStatusBar from '@/components/AnsiStatusBar.vue';

// The ANSI view: cells drawn on a canvas (CellCanvas), or rendered as text in a <pre> (the DOM
// renderer, kept beside it for the trial: workspace.ansiRenderer); a grid pixel is half a
// character cell tall.
const projectStore = useProjectStore();
const workspaceStore = useWorkspaceStore();
const textInputRef = useTemplateRef('textInput');
useTextTool(projectStore, workspaceStore, textInputRef);
const useDom = computed(() => workspaceStore.ansiRenderer === 'dom');
const preRef = useTemplateRef('pre'), canvasRef = useTemplateRef('canvas');
const displayRef = computed(() => (useDom.value ? preRef.value : canvasRef.value));

const metrics = ref(null);
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

// Character cell size in CSS px (null until it can be measured): measured from the <pre>'s font,
// or the canvas renderer's whole-device-pixel cells.
const ensureMetrics = () => {
  if (metrics.value) return metrics.value;
  if (useDom.value) {
    if (displayRef.value) metrics.value = calcMetrics(displayRef.value);
  } else if (canvasRef.value && ensureCellCanvas()) {
    cellCanvas.resize(projectStore.cols, charRowsOf(projectStore.rows), window.devicePixelRatio);
    metrics.value = cellCanvas.metrics;
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

const render = () => {
  if (!projectStore.cells.length || !displayRef.value) return;

  const m = ensureMetrics();
  if (!m || m.cellWidth === 0 || m.lineHeight === 0) {
    metrics.value = null;
    queueRender();
    return;
  }

  if (!useDom.value) {
    if (!ensureCellCanvas()) return;
    // A resize here means the grid or the dpr changed; the overlays follow through metrics.
    if (cellCanvas.resize(projectStore.cols, charRowsOf(projectStore.rows), window.devicePixelRatio)) metrics.value = cellCanvas.metrics;
    cellCanvas.draw(projectStore.cells);
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

// The first whole cell on screen (top-left), where a paste goes with no selection or text cursor.
let originFrame = 0;
let viewportEl = null;
const publishOrigin = () => {
  cancelAnimationFrame(originFrame);
  originFrame = requestAnimationFrame(() => {
    const pre = displayRef.value, m = ensureMetrics();
    if (!pre || !m || !viewportEl) return;
    const p = pre.getBoundingClientRect(), v = viewportEl.getBoundingClientRect();
    const clamp = (n, max) => Math.max(0, Math.min(max, n));
    // A cell hidden by under a pixel still counts as on screen.
    workspaceStore.ansiViewOrigin = {
      col: clamp(Math.ceil((v.left - p.left - pre.clientLeft - 1) / m.cellWidth), projectStore.cols - 1),
      row: clamp(Math.ceil((v.top - p.top - pre.clientTop - 1) / m.lineHeight), charRowsOf(projectStore.rows) - 1),
    };
  });
};
watch([metrics, () => projectStore.cols, () => projectStore.rows], publishOrigin);

onMounted(() => {
  viewportEl = displayRef.value?.closest('article') ?? null;
  viewportEl?.addEventListener('scroll', publishOrigin, { passive: true });
  window.addEventListener('resize', publishOrigin);
  publishOrigin();
  render(); // same reason as the cells watcher: lay out before the viewport's scroll restore
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
  window.removeEventListener('resize', publishOrigin);
});
</script>

<template>
  <div class="ansi-editor">
  <EditorViewport
      :display="displayRef"
      :coords-at="coordsAt"
      scroll-key="ansi"
      view="output"
      :unit="unit"
  >
    <pre v-if="useDom" ref="pre" class="display" :style="{ pointerEvents: 'none' }"></pre>
    <canvas v-else ref="canvas" class="display" :style="{ pointerEvents: 'none' }"></canvas>
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
  border: 1px dashed white;
  box-shadow: 0 0 0 1px black;
  animation: marquee-march 1s steps(1) infinite;
}

@keyframes marquee-march {
  50% { border-color: black; box-shadow: 0 0 0 1px white; }
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
  font: var(--display-font-size) var(--display-font-family);
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
  /* the current display font (displayFonts.js), which everything measures in */
  font-family: var(--display-font-family);
  font-size: var(--display-font-size);
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

/* crisp when the backing scale is capped below the dpr (CellCanvas) */
canvas.display {
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
