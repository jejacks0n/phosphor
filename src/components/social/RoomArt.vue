<script setup>
import { ref, computed, useTemplateRef, watch, onMounted, onBeforeUnmount } from 'vue';
import CellCanvas from '@/lib/CellCanvas';
import { loadFontFaces } from '@/lib/displayFonts';
import { viewWindow, viewIn } from '@/lib/viewWindow';
import { fontFor } from '@/social/wire';

// A room's art, drawn in the host's font as the ANSI view's canvas draws it (AnsiEditor's render,
// without the DOM view): a CellCanvas over the window of cells in view, inside a sizer the whole
// grid's size. A box marks the part the host is looking at; while following, each new view of the
// host's is scrolled to the center. A wheel, a key or a press in it is looking around (a scroll it
// made itself isn't). The host's numbers are a stranger's: the view is held to the grid here, and
// the font's size by fontFor.
const props = defineProps({
  art: { type: Object, default: null },        // { cells, cols, lines, font (as sent: wire.fontOnWire) }
  hostView: { type: Object, default: null },   // { col, row, cols, rows }
  following: { type: Boolean, default: false },
});
const emit = defineEmits(['look-around']);

const scrollRef = useTemplateRef('scroll'), sizerRef = useTemplateRef('sizer'), canvasRef = useTemplateRef('canvas');
const font = computed(() => fontFor(props.art?.font));
const fontKey = computed(() => `${font.value.id}:${font.value.size}`); // a new font gets a new canvas
const unavailable = ref(false);
const metrics = ref(null); // the cell in CSS px the last draw used, which the sizer and the box follow
let cellCanvas = null, renderFrame = null, resizeObserver = null;

const view = computed(() => {
  const v = props.hostView, art = props.art;
  if (!v || !art) return null;
  const col = Math.min(v.col, art.cols - 1), row = Math.min(v.row, art.lines - 1);
  return { col, row, cols: Math.min(v.cols, art.cols - col), rows: Math.min(v.rows, art.lines - row) };
});

const sizerStyle = computed(() => {
  const m = metrics.value, art = props.art;
  return m && art ? { width: `${art.cols * m.cellWidth}px`, height: `${art.lines * m.lineHeight}px` } : {};
});

const boxStyle = computed(() => {
  const v = view.value, m = metrics.value;
  if (!v || !m) return { display: 'none' };
  return {
    left: `${v.col * m.cellWidth}px`,
    top: `${v.row * m.lineHeight}px`,
    width: `${v.cols * m.cellWidth}px`,
    height: `${v.rows * m.lineHeight}px`,
  };
});

const queueRender = () => {
  renderFrame ??= requestAnimationFrame(() => {
    renderFrame = null;
    render();
  });
};

// The canvas for the mounted <canvas> (a new one for each font). No WebGL2: the art can't be shown.
const ensureCellCanvas = () => {
  if (cellCanvas?.canvas === canvasRef.value) return cellCanvas;
  cellCanvas?.destroy();
  try {
    cellCanvas = new CellCanvas(canvasRef.value, { onRestored: queueRender, font: font.value });
  } catch (error) {
    console.warn('The room\'s art needs WebGL2.', error);
    cellCanvas = null;
    unavailable.value = true;
  }
  return cellCanvas;
};

// The window of cells around the viewport, against the layout as it is now (the resize observer
// draws again after a layout change). The window's size can change the cell and the cell the
// window's size; cells are whole device px, so it settles in a pass or two.
const render = () => {
  const art = props.art, el = scrollRef.value;
  if (!art || !el || !canvasRef.value || !ensureCellCanvas()) return;
  const dpr = window.devicePixelRatio;
  let m = cellCanvas.metrics ?? cellCanvas.cellSize(dpr), win;
  for (let pass = 0; pass < 3; pass++) {
    win = viewWindow(viewIn(sizerRef.value, el), { x: m.cellWidth, y: m.lineHeight }, art.cols, art.lines);
    cellCanvas.resize(win.cols, win.rows, dpr);
    const sized = cellCanvas.metrics;
    if (sized.cellWidth === m.cellWidth && sized.lineHeight === m.lineHeight) break;
    m = sized;
  }
  if (metrics.value?.cellWidth !== m.cellWidth || metrics.value?.lineHeight !== m.lineHeight) metrics.value = m;
  cellCanvas.draw(art.cells, { cols: art.cols, rows: art.lines, col: win.col, row: win.row });
  canvasRef.value.style.left = `${win.col * m.cellWidth}px`;
  canvasRef.value.style.top = `${win.row * m.lineHeight}px`;
};

// Following: the host's view in the middle (the browser keeps the scroll inside the art).
const center = () => {
  const v = view.value, m = metrics.value, el = scrollRef.value;
  if (!props.following || !v || !m || !el) return;
  el.scrollLeft = (v.col + v.cols / 2) * m.cellWidth - el.clientWidth / 2;
  el.scrollTop = (v.row + v.rows / 2) * m.lineHeight - el.clientHeight / 2;
};
watch([view, () => props.following, metrics], center, { flush: 'post' });

watch(() => props.art, queueRender, { flush: 'post' });

// The host's font, once its faces have loaded: the glyphs drawn before it had are drawn again.
watch(fontKey, (key) => {
  loadFontFaces(font.value).then(() => {
    if (key !== fontKey.value || !cellCanvas) return;
    cellCanvas.invalidate();
    queueRender();
  });
}, { immediate: true });

const lookAround = () => emit('look-around');
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
const keyDown = (event) => { if (SCROLL_KEYS.has(event.key)) lookAround(); };

onMounted(() => {
  scrollRef.value?.addEventListener('scroll', queueRender, { passive: true });
  resizeObserver = new ResizeObserver(queueRender);
  if (scrollRef.value) resizeObserver.observe(scrollRef.value);
  if (sizerRef.value) resizeObserver.observe(sizerRef.value);
  render();
});

onBeforeUnmount(() => {
  if (renderFrame) cancelAnimationFrame(renderFrame);
  cellCanvas?.destroy();
  scrollRef.value?.removeEventListener('scroll', queueRender);
  resizeObserver?.disconnect();
});
</script>

<template>
  <p v-if="unavailable" class="room-art-unavailable">This browser can't show the room's art</p>
  <div
      v-else
      ref="scroll"
      class="room-art"
      tabindex="0"
      aria-label="The room's art"
      @wheel.passive="lookAround"
      @keydown="keyDown"
      @pointerdown="lookAround"
  >
    <div ref="sizer" class="sizer" :style="sizerStyle">
      <canvas ref="canvas" :key="fontKey"></canvas>
      <div class="host-view" :style="boxStyle"></div>
    </div>
  </div>
</template>

<style scoped>
.room-art {
  position: relative;
  height: 100%;
  overflow: auto;
  background: var(--surface-dark);
}

.sizer {
  position: relative;
}

canvas {
  position: absolute;
  display: block;
}

.host-view {
  position: absolute;
  box-sizing: border-box;
  pointer-events: none;
  outline: 2px solid #ff55ff;
  outline-offset: -2px;
}
</style>
