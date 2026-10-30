<script setup>
import { ref, computed, useTemplateRef, watch, onMounted, onBeforeUnmount } from 'vue';
import CellCanvas from '@/lib/CellCanvas';
import { loadFontFaces } from '@/lib/displayFonts';
import { viewWindow, viewIn } from '@/lib/viewWindow';
import { clampAnsiZoom } from '@/lib/zoom';
import { fontFor } from '@/social/wire';
import { nameColor, nameInk } from '@/social/names';
import UserName from './UserName.vue';

// A room's art, drawn in the host's font as the ANSI view's canvas draws it (AnsiEditor's render,
// without the DOM view): a CellCanvas over the window of cells in view, inside a sizer the whole
// grid's size. A box in the host's name color marks the part they're looking at, and the tag in its
// upper left is the Track button (pressed while tracking). The tag is the box's own child, held to
// the part of the box in view by CSS (sticky), so it moves with the box in the same frame; only once
// the box is out of view is it placed here, at the edge nearest the box, with an arrow toward it. While tracking, each new view of the
// host's is scrolled to the center. A wheel, a key or a press in it is looking around (a scroll it
// made itself isn't; the tag is no part of it); Ctrl+wheel or a pinch asks for a zoom (zoom) instead, and
// a zoom while not tracking keeps the same cell under the pointer, or in the middle of the view. Each draw tells the cell in the middle of the view (looking-at). The host's numbers are a stranger's: the view is held
// to the grid here, and the font's size by fontFor.
const props = defineProps({
  art: { type: Object, default: null },        // { cells, cols, lines, font (as sent: wire.fontOnWire) }
  hostView: { type: Object, default: null },   // { col, row, cols, rows } (the zoom to draw at comes in the zoom prop)
  tracking: { type: Boolean, default: false },
  host: { type: String, default: null },       // the host's name, for the tag and its color
  zoom: { type: Number, default: 1 },          // the cell's size against the font's (the host's, never above 1)
  boxed: { type: Boolean, default: true },     // the host's box and tag (false: just the art, scrolled to the view)
});
const emit = defineEmits(['look-around', 'track', 'looking-at', 'zoom']);

const scrollRef = useTemplateRef('scroll'), sizerRef = useTemplateRef('sizer'), canvasRef = useTemplateRef('canvas'), tagRef = useTemplateRef('tag');
const font = computed(() => fontFor(props.art?.font));
const fontKey = computed(() => `${font.value.id}:${font.value.size}`); // a new font gets a new canvas
const unavailable = ref(false);
const metrics = ref(null); // the cell in CSS px the last draw used, which the sizer and the box follow
let cellCanvas = null, renderFrame = null, resizeObserver = null;
let sizedZoom = null;   // the zoom the canvas was last sized at
let held = null;        // { col, row, x, y }: the cell to keep at x, y in the view through a zoom

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

const colors = computed(() => (props.host ? { '--host': nameColor(props.host), '--host-ink': nameInk(nameColor(props.host)) } : {}));

// The tag once the box is out of view: at the edge of the view nearest the box (6 px in), as an offset
// from the box's corner, with an arrow toward it. null while any of the box is in view (CSS holds it).
const away = ref(null);   // { left, top, arrow }
const ARROWS = { '↑←': '↖', '↑→': '↗', '↓←': '↙', '↓→': '↘' };
const clamp = (n, low, high) => Math.max(low, Math.min(n, high));
const placeTag = () => {
  const v = view.value, m = metrics.value, el = scrollRef.value, tag = tagRef.value;
  if (!v || !m || !el || !tag) return;
  const x = v.col * m.cellWidth, y = v.row * m.lineHeight, right = x + v.cols * m.cellWidth, bottom = y + v.rows * m.lineHeight;
  const seen = viewIn(sizerRef.value, el);   // from the art's corner: art smaller than the view starts past the view's
  const [x0, y0, x1, y1] = [seen.x, seen.y, seen.x + seen.width, seen.y + seen.height];
  const up = bottom <= y0 ? '↑' : y >= y1 ? '↓' : '', across = right <= x0 ? '←' : x >= x1 ? '→' : '';
  const arrow = ARROWS[up + across] ?? (up || across);
  if (arrow !== (away.value?.arrow ?? '')) queueRender();   // the arrow changes the tag's width: placed again once it's drawn
  away.value = arrow ? {
    left: clamp(x, x0 + 6, x1 - tag.offsetWidth - 6) - x,
    top: clamp(y, y0 + 6, y1 - tag.offsetHeight - 6) - y,
    arrow,
  } : null;
};
const tagStyle = computed(() => (away.value ? { left: `${away.value.left}px`, top: `${away.value.top}px` } : {}));

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
  let m = (sizedZoom === props.zoom && cellCanvas.metrics) || cellCanvas.cellSize(dpr, props.zoom), win, seen;
  sizedZoom = props.zoom;
  for (let pass = 0; pass < 3; pass++) {
    seen = viewIn(sizerRef.value, el);
    win = viewWindow(seen, { x: m.cellWidth, y: m.lineHeight }, art.cols, art.lines);
    cellCanvas.resize(win.cols, win.rows, dpr, props.zoom);
    const sized = cellCanvas.metrics;
    if (sized.cellWidth === m.cellWidth && sized.lineHeight === m.lineHeight) break;
    m = sized;
  }
  if (metrics.value?.cellWidth !== m.cellWidth || metrics.value?.lineHeight !== m.lineHeight) metrics.value = m;
  else held = null;   // a zoom too small to change the cell
  cellCanvas.draw(art.cells, { cols: art.cols, rows: art.lines, col: win.col, row: win.row });
  canvasRef.value.style.left = `${win.col * m.cellWidth}px`;
  canvasRef.value.style.top = `${win.row * m.lineHeight}px`;
  emit('looking-at', { middleCol: (seen.x + seen.width / 2) / m.cellWidth, middleRow: (seen.y + seen.height / 2) / m.lineHeight });
  placeTag();
};

// Tracking: the host's view in the middle (the browser keeps the scroll inside the art).
const center = () => {
  const v = view.value, m = metrics.value, el = scrollRef.value;
  if (!props.tracking || !v || !m || !el) return;
  el.scrollLeft = (v.col + v.cols / 2) * m.cellWidth - el.clientWidth / 2;
  el.scrollTop = (v.row + v.rows / 2) * m.lineHeight - el.clientHeight / 2;
};
watch([view, () => props.tracking, metrics], center, { flush: 'post' });

// Looking around, a zoom holds a cell in place: taken before the art changes size, put back once it has.
const hold = (x, y) => {
  const m = metrics.value, seen = viewIn(sizerRef.value, scrollRef.value);
  if (m) held = { col: (seen.x + x) / m.cellWidth, row: (seen.y + y) / m.lineHeight, x, y };
};
watch(() => props.zoom, () => {
  if (!props.tracking && !held) hold(scrollRef.value.clientWidth / 2, scrollRef.value.clientHeight / 2);
});
watch(metrics, (m) => {
  if (!held) return;
  scrollRef.value.scrollLeft = held.col * m.cellWidth - held.x;
  scrollRef.value.scrollTop = held.row * m.lineHeight - held.y;
  held = null;
}, { flush: 'post' });

watch([() => props.art, () => props.zoom], queueRender, { flush: 'post' });
watch([view, () => props.tracking, () => props.host], queueRender, { flush: 'post' });   // the tag's place and size

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
const wheel = (event) => {
  if (!event.ctrlKey || !props.boxed) return lookAround();
  event.preventDefault();   // the page's own zoom, otherwise
  const zoom = clampAnsiZoom(props.zoom * Math.exp(-event.deltaY * 0.01));   // as the ANSI view's
  if (zoom === props.zoom) return;
  const rect = scrollRef.value.getBoundingClientRect();
  hold(event.clientX - rect.left, event.clientY - rect.top);
  emit('zoom', zoom);
};
const keyDown = (event) => { if (SCROLL_KEYS.has(event.key)) lookAround(); };

onMounted(() => {
  scrollRef.value?.addEventListener('scroll', queueRender, { passive: true });
  resizeObserver = new ResizeObserver(() => {
    center();   // a view of a new size has a new middle
    queueRender();
  });
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
      :style="colors"
      tabindex="0"
      role="region"
      aria-label="The room's art"
      @wheel="wheel"
      @keydown="keyDown"
      @pointerdown="lookAround"
  >
    <div ref="sizer" class="sizer" :style="sizerStyle">
      <canvas ref="canvas" :key="fontKey"></canvas>
      <div v-if="boxed" class="host-view" :style="boxStyle">
        <button
            v-if="host"
            ref="tag"
            class="host-tag"
            :class="{ tracking, away: away }"
            :style="tagStyle"
            :aria-label="`Track ${host}`"
            :aria-pressed="tracking"
            @pointerdown.stop
            @keydown.stop
            @click="emit('track')"
        >
          <span v-if="away" aria-hidden="true">{{ away.arrow }}</span>
          <UserName class="name" :name="host" />
          <span v-if="tracking" class="state">· tracking</span>
          <span v-else class="track">Track ›</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.room-art {
  position: relative;
  display: flex;
  height: 100%;
  overflow: auto;
  background: var(--surface-dark);
}

.sizer {
  position: relative;
  flex: none;
  margin: auto;   /* in the middle when it fits; unlike centering the flex box, its corner stays reachable when it doesn't */
  overflow: clip;   /* the tag of a box at the grid's edge doesn't make the art scroll past it */
}

canvas {
  position: absolute;
  display: block;
}

.host-view {
  position: absolute;
  box-sizing: border-box;
  pointer-events: none;
  outline: 2px solid var(--host, #ff55ff);
  outline-offset: -2px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), 0 2px 10px rgba(0, 0, 0, 0.6);   /* so it shows on any art */
}

/* The host's tag, the Track button: filled while tracking, a dark tag with a Track pill when not.
   Sticky in the box: it holds to the part of the box in view. Away, it's placed from the box's corner. */
button.host-tag,
button.host-tag:hover,
button.host-tag:active {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 1;
  display: flex;
  width: max-content;
  pointer-events: auto;
  align-items: center;
  gap: 6px;
  height: auto;
  padding: 2px 6px;
  border: 1px solid var(--host);
  border-radius: 0 0 4px 0;
  background: rgba(0, 0, 0, 0.85);
  color: #ffffff;   /* the color itself is the border and the pill: a dark one is hard to read on black */
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 400;
  line-height: 16px;
  white-space: nowrap;
  transform: none;
  filter: none;
}
button.host-tag.away {
  position: absolute;
  border-radius: 4px;
}
button.host-tag.tracking {
  background: var(--host);
  color: var(--host-ink);
  cursor: default;
}
button.host-tag span.track {
  padding: 0 6px;
  border-radius: 8px;
  background: var(--host);
  color: var(--host-ink);
  font-family: system-ui, sans-serif;
  font-weight: 600;
}
button.host-tag:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
