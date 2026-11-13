<script setup>
import { computed, ref, useTemplateRef, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { useEventListener, useMutationObserver, useResizeObserver } from '@vueuse/core';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { charRowsOf } from '@/lib/Cells';
import { cellCount, guideLabel, rulerMarks, shownZero, snapHalf } from '@/lib/rulers';

// The character rulers along the view's top and left, and the guides across it, over the view (box) whatever
// it's scrolled to. They count characters on every view; zero and the guides are in characters from the top
// left (whole: an edge, half: a middle). Only the Hand grabs them: out of a ruler comes a guide, a guide let go
// on a ruler or off the view goes, the pink triangle moves that ruler's zero and the corner both. Nothing here
// changes the store until a drag is let go.
const props = defineProps({
  box: { type: Object, required: true },        // the view's client box, fixed (EditorViewport's overArt)
  root: { type: Object, default: null },        // the scrolling element
  display: { type: Object, default: null },     // the element cells are measured against
  unit: { type: Object, required: true },       // { x, y }: CSS px per grid pixel (a character is x by 2y)
  coordsAt: { type: Function, required: true }, // (event) => { x, y } in fractional grid pixels, or null
  hover: { type: Object, default: null },       // { col, row }: the character under the pointer, or null
});
const project = useProjectStore();
const workspace = useWorkspaceStore();
const { t } = useI18n();
const overlay = useTemplateRef('overlay');
const topRuler = useTemplateRef('top');
const leftRuler = useTemplateRef('left');

const TOP = 20, LEFT = 30;   // the rulers' thickness, in CSS px
const NEAR_ZERO = 8;         // how close to a triangle a press grabs zero
const GUIDE_COLOR = '#22e3ff';

const moved = ref(0);   // the view scrolled, resized or zoomed, or the theme changed: everything is placed again
const bump = () => { moved.value++; };
useEventListener(() => props.root, 'scroll', bump, { passive: true });
useResizeObserver(() => props.root, bump);
useResizeObserver(() => props.display, bump);
useMutationObserver(document.documentElement, bump, { attributeFilter: ['data-theme'] });

const isHand = computed(() => workspace.activeTool === 'hand');
const cols = computed(() => project.cols);
const rows = computed(() => charRowsOf(project.rows));
const cellsOf = (axis) => (axis === 'x' || axis === 'v' ? cols.value : rows.value);   // 'v' guides lie along columns

// The drag under way: { kind: 'guide', axis: 'v' | 'h', index (null: a new one), offset, pos (null: off the art) },
// { kind: 'zero', axis: 'x' | 'y', offset, zero } or { kind: 'corner', zero }, with the pointer at client and
// zero as it showed when the press began (shown).
const drag = ref(null);

// Zero as drawn and counted: a zero being dragged where it is, and past the drawing's edge at the edge.
const zero = computed(() => {
  const z = { ...workspace.rulerZero, ...drag.value?.zero };
  return { x: shownZero(z.x, cols.value), y: shownZero(z.y, rows.value) };
});

// Where the drawing's top-left corner is, in px from the box's.
const origin = computed(() => {
  void moved.value, props.unit, props.box, cols.value, rows.value;
  const { root, display } = props;
  if (!root || !display) return null;
  const seen = root.getBoundingClientRect(), at = display.getBoundingClientRect();
  return { x: at.left - seen.left + display.clientLeft, y: at.top - seen.top + display.clientTop };
});
const sizeOf = (axis) => (axis === 'x' || axis === 'v' ? props.unit.x : 2 * props.unit.y);   // a character's px along an axis
const pxOf = (axis, pos) => (axis === 'x' || axis === 'v' ? origin.value.x : origin.value.y) + pos * sizeOf(axis);

// The guides shown: those on the drawing, one being dragged where it would land (hidden off the art), a new one.
const lines = computed(() => {
  if (!origin.value) return [];
  const d = drag.value?.kind === 'guide' ? drag.value : null;
  const all = workspace.guides.map((g, index) => (d?.index === index ? { ...g, index, pos: d.pos, ghost: true } : { ...g, index }));
  if (d && d.index === null && d.pos !== null) all.push({ axis: d.axis, pos: d.pos, index: null, ghost: true });
  return all.filter((g) => g.pos === null || g.pos <= cellsOf(g.axis)).map((g) => ({
    ...g,
    style: g.pos === null ? null : g.axis === 'v' ? { left: `${pxOf('v', g.pos) - 5}px` } : { top: `${pxOf('h', g.pos) - 5}px` },
  }));
});

// Each ruler's moving label: the hovered character's count from zero, at its middle.
const pills = computed(() => {
  const hover = props.hover;
  if (!hover || drag.value || !origin.value) return null;
  return {
    top: { text: guideLabel(cellCount(hover.col, zero.value.x)), style: { left: `${pxOf('x', hover.col + 0.5)}px` } },
    left: { text: guideLabel(cellCount(hover.row, zero.value.y)), style: { top: `${pxOf('y', hover.row + 0.5)}px` } },
  };
});

// Where zero is, in the 1-based columns and rows used everywhere else.
function zeroText(axis, z) {
  const [on, between] = axis === 'x' ? ['zeroOnColumn', 'zeroBetweenColumns'] : ['zeroOnRow', 'zeroBetweenRows'];
  return z % 1 ? t(`rulers.${on}`, { n: Math.floor(z) + 1 }) : t(`rulers.${between}`, { a: z, b: z + 1 });
}

// The label beside the pointer while dragging, and the dashed zero lines.
const dragPill = computed(() => {
  const d = drag.value;
  if (!d?.client) return null;
  let text;
  if (d.kind === 'guide') text = d.pos !== null ? guideLabel(d.pos - zero.value[d.axis === 'v' ? 'x' : 'y']) : d.index !== null ? t('rulers.remove') : null;
  else if (d.kind === 'zero') text = zeroText(d.axis, zero.value[d.axis]);
  else text = `${zeroText('x', zero.value.x)} · ${zeroText('y', zero.value.y)}`;
  return text && { text, zeroing: d.kind !== 'guide', style: { left: `${d.client.x + 14}px`, top: `${d.client.y + 14}px` } };
});
const zeroLines = computed(() => {
  const d = drag.value;
  if (!origin.value || (d?.kind !== 'zero' && d?.kind !== 'corner')) return [];
  return (d.kind === 'corner' ? ['x', 'y'] : [d.axis]).map((axis) => (axis === 'x'
    ? { axis: 'v', style: { left: `${pxOf('x', zero.value.x)}px` } }
    : { axis: 'h', style: { top: `${pxOf('y', zero.value.y)}px` } }));
});

// A pointer's place in characters along an axis.
function cellsAt(event, axis) {
  const at = props.coordsAt(event);
  return at && (axis === 'x' || axis === 'v' ? at.x : at.y / 2);
}
// Over a ruler, or off the view.
function offArt(event) {
  const r = overlay.value.getBoundingClientRect();
  const x = event.clientX - r.left, y = event.clientY - r.top;
  return x < LEFT || y < TOP || x >= r.width || y >= r.height;
}
function nearZero(axis, event) {
  const r = overlay.value.getBoundingClientRect();
  return origin.value && Math.abs((axis === 'x' ? event.clientX - r.left : event.clientY - r.top) - pxOf(axis, zero.value[axis])) <= NEAR_ZERO;
}

// The press is kept from the view, so the view's focus is taken here, as a press on it would: a toolbar field
// (the Rulers checkbox) kept would swallow the tool keys.
function start(event, d) {
  if (event.button) return;
  props.root?.focus({ preventScroll: true });
  drag.value = { ...d, client: null, shown: { ...zero.value } };
}
// A ruler: its triangle drags zero, anywhere else a new guide (out of the top ruler a horizontal one).
function pressRuler(axis, event) {
  if (nearZero(axis, event)) start(event, { kind: 'zero', axis, offset: (cellsAt(event, axis) ?? 0) - zero.value[axis], zero: null });
  else start(event, { kind: 'guide', axis: axis === 'x' ? 'h' : 'v', index: null, offset: 0, pos: null });
}
// A guide is held where it was grabbed, so a press alone doesn't move it.
function pressGuide(guide, event) {
  start(event, { kind: 'guide', axis: guide.axis, index: guide.index, offset: (cellsAt(event, guide.axis) ?? guide.pos) - guide.pos, pos: guide.pos });
}

function track(event) {
  const d = drag.value;
  d.client = { x: event.clientX, y: event.clientY };
  if (d.kind === 'corner') {
    const x = cellsAt(event, 'x'), y = cellsAt(event, 'y');
    if (x !== null) d.zero = { x: snapHalf(x, cols.value), y: snapHalf(y, rows.value) };
    return;
  }
  const at = cellsAt(event, d.axis);
  if (at === null) return;
  const pos = snapHalf(at - d.offset, cellsOf(d.axis));
  if (d.kind === 'zero') d.zero = { [d.axis]: pos };
  else d.pos = offArt(event) ? null : pos;
}
// The drag goes on whatever the tool is by now (Space let go mid-drag), and ends where it's let go: the corner
// only where it was dragged to, so a click (or a double-click) on it moves nothing.
useEventListener(window, 'pointermove', (event) => { if (drag.value) track(event); });
useEventListener(window, 'pointercancel', () => { drag.value = null; });
useEventListener(window, 'pointerup', (event) => {
  const d = drag.value;
  if (!d) return;
  if (d.kind !== 'corner') track(event);
  drag.value = null;
  if (d.kind === 'guide') {
    if (d.index !== null && !workspace.guides[d.index]) return;   // the drawing changed under the drag
    if (d.index === null) { if (d.pos !== null) workspace.addGuide(d.axis, d.pos); }
    else if (d.pos === null) workspace.removeGuide(d.index);
    else if (d.pos !== workspace.guides[d.index].pos) workspace.moveGuide(d.index, d.pos);
    return;
  }
  // A zero left where it showed stays as it's kept, even past the drawing's edge (it shows at the edge).
  for (const [axis, pos] of Object.entries(d.zero ?? {})) if (pos !== d.shown[axis] && pos !== workspace.rulerZero[axis]) workspace.setRulerZero(axis, pos);
});

// One ruler on its canvas: the drawing's span, the hovered character, the ticks and labels, the guides' ticks
// and zero's triangle (with a "0" beside it on an edge). Colors are the theme's.
function paint(canvas, axis) {
  if (!canvas || !origin.value) return;
  const top = axis === 'x';
  const W = top ? parseFloat(props.box.width) - LEFT : LEFT, H = top ? TOP : parseFloat(props.box.height) - TOP;
  if (!(W > 0 && H > 0)) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(canvas), color = (name) => css.getPropertyValue(name).trim();
  const size = sizeOf(axis), cells = cellsOf(axis), z = zero.value[axis];
  const start = pxOf(axis, 0) - (top ? LEFT : TOP), length = top ? W : H, thick = top ? H : W;
  const band = (from, span) => (top ? ctx.fillRect(from, 0, span, H) : ctx.fillRect(0, from, W, span));
  const tick = (p, l) => (top ? ctx.fillRect(Math.round(p), H - l, 1, l) : ctx.fillRect(W - l, Math.round(p), l, 1));

  ctx.fillStyle = color('--surface-1');
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = color('--surface-3');
  band(start, cells * size);
  const hovered = props.hover && !drag.value ? props.hover[top ? 'col' : 'row'] : null;
  if (hovered !== null) {
    ctx.fillStyle = color('--accent');
    ctx.globalAlpha = 0.45;
    band(start + hovered * size, size);
    ctx.globalAlpha = 1;
  }
  const marks = rulerMarks({ cells, zero: z, size, start, length, gap: top ? 28 : 14 });   // a row's label needs less room than a column's
  ctx.fillStyle = color('--text-muted');
  for (const p of marks.edges) tick(p, 4);
  for (const p of marks.fives) tick(p, thick * 0.38);
  for (const p of marks.tens) tick(p, thick * 0.55);
  ctx.fillStyle = color('--text');
  ctx.font = '600 9px "JetBrains Mono", monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = top ? 'center' : 'left';
  for (const { at, text } of marks.labels) top ? ctx.fillText(text, at, 6) : ctx.fillText(text, 2, at);
  ctx.fillStyle = GUIDE_COLOR;
  for (const g of lines.value) if (g.pos !== null && (g.axis === 'v') === top) tick(start + g.pos * size, thick);
  const zp = start + z * size;
  ctx.fillStyle = color('--accent-hot');
  ctx.beginPath();
  if (top) { ctx.moveTo(zp - 6, 0); ctx.lineTo(zp + 6, 0); ctx.lineTo(zp, 9); }
  else { ctx.moveTo(0, zp - 6); ctx.lineTo(0, zp + 6); ctx.lineTo(9, zp); }
  ctx.fill();
  if (z % 1 === 0) {
    ctx.textAlign = 'left';
    top ? ctx.fillText('0', zp + 7, 6) : ctx.fillText('0', 11, zp);
  }
  ctx.fillStyle = color('--border');
  top ? ctx.fillRect(0, H - 1, W, 1) : ctx.fillRect(W - 1, 0, 1, H);
}
watchEffect(() => {
  paint(topRuler.value, 'x');
  paint(leftRuler.value, 'y');
}, { flush: 'post' });
</script>

<template>
  <div v-if="workspace.rulers" ref="overlay" class="guide-rulers" :class="{ hand: isHand }" :style="box">
    <div
        v-for="g in lines"
        :key="g.index ?? 'new'"
        class="guide"
        :class="[g.axis, { ghost: g.ghost }]"
        :data-index="g.index ?? undefined"
        :hidden="g.pos === null"
        :style="g.style"
        :title="t('rulers.guideTitle')"
        @pointerdown.stop.prevent="pressGuide(g, $event)"
        @mousedown.stop
        @touchstart.stop
    ></div>
    <div v-for="line in zeroLines" :key="line.axis" class="ruler-zero" :class="line.axis" :style="line.style"></div>
    <canvas ref="top" class="ruler top" @pointerdown.stop.prevent="pressRuler('x', $event)" @mousedown.stop @touchstart.stop @dblclick="nearZero('x', $event) && workspace.resetRulerZero('x')"></canvas>
    <canvas ref="left" class="ruler left" @pointerdown.stop.prevent="pressRuler('y', $event)" @mousedown.stop @touchstart.stop @dblclick="nearZero('y', $event) && workspace.resetRulerZero('y')"></canvas>
    <div
        class="ruler-corner"
        :title="t('rulers.cornerTitle')"
        @pointerdown.stop.prevent="start($event, { kind: 'corner', zero: null })"
        @mousedown.stop
        @touchstart.stop
        @dblclick="workspace.resetRulerZero()"
    ></div>
    <template v-if="pills">
      <div class="ruler-pill top" :style="pills.top.style">{{ pills.top.text }}</div>
      <div class="ruler-pill left" :style="pills.left.style">{{ pills.left.text }}</div>
    </template>
    <div v-if="dragPill" class="ruler-drag-pill" :class="{ zeroing: dragPill.zeroing }" :style="dragPill.style">{{ dragPill.text }}</div>
  </div>
</template>

<style scoped>
div.guide-rulers {
  position: fixed;   /* over the view whatever it's scrolled to, as the sharing overlay is */
  z-index: 150;
  overflow: hidden;
  pointer-events: none;
}

canvas.ruler, div.ruler-corner, div.guide {
  position: absolute;
  display: block;
  touch-action: none;
}
div.guide-rulers.hand :is(canvas.ruler, div.ruler-corner, div.guide) {
  pointer-events: auto;
}
div.guide[hidden] {
  display: none;
}

canvas.ruler.top {
  left: 30px;
  top: 0;
  width: calc(100% - 30px);
  height: 20px;
  cursor: s-resize;
}
canvas.ruler.left {
  left: 0;
  top: 20px;
  width: 30px;
  height: calc(100% - 20px);
  cursor: e-resize;
}
div.ruler-corner {
  left: 0;
  top: 0;
  width: 30px;
  height: 20px;
  box-sizing: border-box;
  background: var(--surface-1);
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  cursor: crosshair;
}
div.ruler-corner::after {   /* both zeros' lines, meeting */
  content: "";
  position: absolute;
  inset: 5px 7px 5px 9px;
  border-left: 1px dashed var(--accent-hot);
  border-top: 1px dashed var(--accent-hot);
  opacity: 0.7;
}

/* A guide: a 1 px line in the middle of an 11 px grab area. */
div.guide.v {
  top: 20px;
  bottom: 0;
  width: 11px;
  cursor: ew-resize;
}
div.guide.h {
  left: 30px;
  right: 0;
  height: 11px;
  cursor: ns-resize;
}
div.guide::after {
  content: "";
  position: absolute;
  background: #22e3ff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45);
}
div.guide.v::after {
  left: 5px;
  top: 0;
  bottom: 0;
  width: 1px;
}
div.guide.h::after {
  top: 5px;
  left: 0;
  right: 0;
  height: 1px;
}
div.guide.ghost::after {
  opacity: 0.6;
}

div.ruler-zero {
  position: absolute;
}
div.ruler-zero.v {
  top: 20px;
  bottom: 0;
  border-left: 1px dashed var(--accent-hot);
}
div.ruler-zero.h {
  left: 30px;
  right: 0;
  border-top: 1px dashed var(--accent-hot);
}

div.ruler-pill, div.ruler-drag-pill {
  position: absolute;
  font: 600 11px/1 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  padding: 4px 6px;
  border-radius: 4px;
  color: #ffffff;
  background: var(--accent);
}
div.ruler-pill.top {
  top: 1px;
  transform: translateX(-50%);
}
div.ruler-pill.left {
  left: 1px;
  transform: translateY(-50%);
}
div.ruler-drag-pill {
  position: fixed;   /* beside the pointer, even off the view */
  background: #000000;
  border: 1px solid #22e3ff;
  color: #22e3ff;
}
div.ruler-drag-pill.zeroing {
  border-color: var(--accent-hot);
  color: #ffb3ff;
}
</style>
