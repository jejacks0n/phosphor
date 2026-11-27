<script setup>
import { ref, computed, unref, useTemplateRef, watch, onMounted, onBeforeUnmount } from 'vue';
import { useElementBounding } from '@vueuse/core';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useDrawingStore } from '@/store/DrawingStore';
import ArtistCursors from '@/components/social/ArtistCursors.vue';
import PauseLayer from '@/components/social/PauseLayer.vue';
import GuideRulers from '@/components/GuideRulers.vue';
import { useEditorInteractions } from '@/composables/useEditorInteractions';
import { pressedWhileBusy } from '@/composables/useBusy';
import { getTool } from '@/tools';
import { charRowsOf, cellAt } from '@/lib/Cells';
import { squarePixels, squareCells } from '@/lib/Brushes';
import { pickMode, pickTargetOf } from '@/lib/pickMode';
import { drawsCells } from '@/tools/shapes';
import { isArtFile } from '@/lib/ArtFile';
import { isSvgFile } from '@/lib/SvgFile.js';
import { isControl, ownsKey } from '@/lib/fields';
import { withShape } from '@/document/shapes.js';
import { pickedCell } from '@/store/project/reading.js';
import { gridAt } from '@/lib/CellCanvas';
import { strokeMirror, withMirror, mirrorAxes, mirrorOps, mirrorPoint, axisLines } from '@/lib/mirror';

// The scrollable, pannable, zoomable shell both editors sit in. The editor supplies the display
// element (slot) and how pointer events map to grid pixels (coordsAt); the active tool (src/tools)
// decides what a stroke does. coordsAt and zoom are read once at setup: pass stable values.
const props = defineProps({
  display: { type: Object, default: null },                 // the sizer (or the DOM view's pre) that coordinates are measured against
  coordsAt: { type: Function, required: true },             // (event) => { x, y } in fractional grid pixels, or null
  zoom: { type: Object, default: null },                    // { get, set, clamp, start, drag? } for the view's zoom (start: Cmd/Ctrl+0's); null: not zoomable
  scrollKey: { type: String, required: true },              // 'input' | 'ansi': where scroll position is remembered
  contentSize: { type: Object, default: null },             // { width, height } -> padded layout that keeps its center on resize
  view: { type: String, required: true },                   // 'input' (PIXEL) | 'output' (ANSI) | 'vector' (VECTOR), passed to tools
  unit: { type: Object, default: null },                    // { x, y }: CSS px per grid pixel, for tool previews
  startTop: { type: Boolean, default: false },              // starts at the art's top-left where it doesn't fit (placeStart)
});

const projectStore = useProjectStore();
const workspaceStore = useWorkspaceStore();
const drawingStore = useDrawingStore();
const tool = computed(() => getTool(workspaceStore.activeTool));
const toolCtx = () => ({ project: projectStore, workspace: workspaceStore, view: props.view, unit: props.unit });
// Mirror mode: a mirroring tool's call runs with the store marked, so its edit-layer writes land on both sides.
const mirrored = (fn) => withMirror(projectStore, strokeMirror(workspaceStore, projectStore, tool.value), fn);
const rootRef = useTemplateRef('root');
const isMouseOver = ref(false);

const {
  mousePos,
  startPaint,
  onMouseMove,
  commitPaint,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  handleTouchCancel,
  handleWheel,
  centerContent,
  zoomAtMiddle,
} = useEditorInteractions({
  containerRef: rootRef,
  displayRef: computed(() => props.display),
  activeTool: tool,
  // The store's value, not a prop: several zoom events can land in one frame, before a prop would update.
  editZoom: computed(() => props.zoom?.get()),
  clampZoom: props.zoom?.clamp,
  dragZoomBy: props.zoom?.drag,
  workspaceStore,
  disableZoom: !props.zoom,
  callbacks: {
    pixelCoordsAt: props.coordsAt,
    // Refused while the busy note's up (a fill, a file opening), or made while it was (pressedWhileBusy): what's begun
    // goes first, alone.
    onPaintStart: (event, pos) => mirrored(() => (!projectStore._paused && !pressedWhileBusy(event) && tool.value.begin ? tool.value.begin(toolCtx(), pos, event) !== false : false)),
    onPaintMove: (from, to) => mirrored(() => tool.value.move?.(toolCtx(), from, to)),
    onPaintEnd: () => mirrored(() => tool.value.end?.(toolCtx())),
    // A stroke a pinch interrupted: what it drew is taken back, then the tool's cancel (or its end) runs.
    onPaintCancel: () => mirrored(() => {
      projectStore.cancelEdit();
      (tool.value.cancel ?? tool.value.end)?.(toolCtx());
    }),
    onColorPick: pickAt,
    onZoomChange: props.zoom?.set,
  },
});

// The eyedropper: the pixel view picks the paint color, into the foreground or the background (its FG or BG;
// Shift: the other); the ANSI view picks the cell's underlying colors (the [FG][BG] toggles; Shift: foreground
// only, Alt: background only). Picks repeat while
// dragging; the recent colors get the old and new colors when the pick ends (workspace.endPick).
function pickAt(pos, event) {
  if (projectStore._paused) return; // the layer takes the press
  if (pos.x < 0 || pos.y < 0 || pos.x >= projectStore.cols || pos.y >= projectStore.rows) return; // off the grid
  const mode = pickMode({
    view: props.view,
    shiftKey: !!event?.shiftKey,
    altKey: !!event?.altKey,
    swapped: workspaceStore.pickSwapped,
    target: pickTargetOf(props.view === 'input' ? workspaceStore.pixelPickSlot : workspaceStore.pickLayers),
  });
  // VECTOR: the color under the point is the selected shapes' Fill or Stroke (workspace.vectorPickSlot; Shift:
  // the other), one step for the whole drag (the picker's end commits it), or the next shape's.
  if (props.view === 'vector') {
    const hex = projectStore.rawColorAt(pos.x, pos.y), stroke = workspaceStore.vectorPickSlot.stroke;
    const slot = stroke !== !!event?.shiftKey ? 'stroke' : 'fill';
    const keys = workspaceStore.vectorSelected.filter((key) => projectStore.shapes.has(key));
    if (!keys.length) workspaceStore.vectorStyle = { ...workspaceStore.vectorStyle, [slot]: hex };
    else {
      projectStore.beginEdit();
      projectStore.updateShapes(keys.map((key) => [key, withShape(projectStore.shapes.get(key), { [slot]: hex })]));
    }
    return;
  }
  // The pixel view picks exactly the half under the pointer. A picker held with Alt in the ANSI view reads
  // the cell like the Eyedropper does (below), into the foreground, or with Alt+Shift the background.
  if (props.view === 'input') {
    workspaceStore.pickColor(mode === 'bg' ? 'bg' : 'fg', projectStore.rawColorAt(pos.x, pos.y));
    return;
  }
  const at = cellAt(pos.x, pos.y, projectStore.cols, projectStore.rows);
  if (!at) return;
  const { col, row, fg, bg, fgFrom, bgFrom, fgIndex, bgIndex } = pickedCell(projectStore, at); // a 16 or 231 is picked as itself
  // For the status bar: what this pick read, and which layer each color came from.
  workspaceStore.lastPick = { col, row, fg, bg, fgFrom, bgFrom };
  if (mode === 'fg' || mode === 'both') workspaceStore.pickColor('fg', fg, fgIndex);
  if (mode === 'bg' || mode === 'both') workspaceStore.pickColor('bg', bg, bgIndex);
}

// Brush/eraser outline under the pointer, or the character cell for cell tools.
const gridPos = (pos) => gridAt(pos, props.unit);
const CELL_HIGHLIGHT = { borderRadius: '0', transform: 'none', mixBlendMode: 'difference', background: 'white', outline: '1px solid red', border: 'none', boxShadow: 'none' };
const previewStyle = computed(() => {
  const preview = tool.value.preview;
  const pos = mousePos.value, unit = props.unit;
  if (!preview || !pos || !isMouseOver.value || !unit) return { display: 'none' };

  if (preview.shape === 'cell') {
    const cellW = unit.x, cellH = unit.y * 2;
    const col = Math.floor(pos.x / cellW), row = Math.floor(pos.y / cellH);
    if (col < 0 || row < 0 || col >= projectStore.cols || row >= charRowsOf(projectStore.rows)) return { display: 'none' };
    const display = unref(props.display); // inside its border, as pos is
    return {
      display: 'block', width: `${cellW}px`, height: `${cellH}px`, ...CELL_HIGHLIGHT,
      left: `${col * cellW + (display?.clientLeft ?? 0)}px`, top: `${row * cellH + (display?.clientTop ?? 0)}px`,
    };
  }

  const size = preview.size(workspaceStore, props.view);
  const ansi = props.view === 'output', round = preview.shape !== 'square' || !!preview.soft?.(workspaceStore, props.view);
  // The hard eraser outlines exactly what it covers: whole cells in the ANSI view (its size counts cells), pixels in the
  // pixel view. Off the canvas it covers nothing, and its outline follows the pointer at its size as the Brush's circle
  // does: the pointer itself is hidden for both (global.css), so with no outline there'd be nothing to see.
  if (preview.snap && !round) {
    const { cols, rows } = projectStore;
    const parts = ansi ? squareCells(gridPos(pos), gridPos(pos), size, cols, rows).map(c => ({ x: c.col, y: c.row })) : squarePixels(gridPos(pos), gridPos(pos), size, cols, rows, projectStore.pixelAspect);
    if (parts.length) {
      const x0 = Math.min(...parts.map(c => c.x)), x1 = Math.max(...parts.map(c => c.x));
      const y0 = Math.min(...parts.map(c => c.y)), y1 = Math.max(...parts.map(c => c.y));
      const w = unit.x, h = ansi ? unit.y * 2 : unit.y;
      const display = unref(props.display);
      return {
        display: 'block', boxSizing: 'border-box', borderRadius: '0', transform: 'none',
        width: `${(x1 - x0 + 1) * w}px`, height: `${(y1 - y0 + 1) * h}px`,
        left: `${x0 * w + (display?.clientLeft ?? 0)}px`, top: `${y0 * h + (display?.clientTop ?? 0)}px`,
      };
    }
  }
  const display = unref(props.display); // pos is inside its border; the preview sits in its box
  return {
    display: 'block',
    width: `${size * unit.x}px`,
    height: `${size * unit.y * (preview.snap && ansi && !round ? 2 : 1 / projectStore.pixelAspect)}px`, // the ANSI view's hard eraser counts cells, two grid pixels tall
    left: `${pos.x + (display?.clientLeft ?? 0)}px`,
    top: `${pos.y + (display?.clientTop ?? 0)}px`,
    borderRadius: round ? '50%' : '0',
  };
});

// The Shapes tool's drag outline (grid positions -> CSS px), drawn while dragging: the rect, its ellipse, or the line
// (the Paint Bucket's gradient line too: line, between grid pixels).
// In the ANSI view a line/character rectangle snaps to whole cells, so its outline does too; it sits
// inside the display's border, like the cursor and cell highlights.
const shapeDragStyle = (drag) => {
  const unit = props.unit;
  if (!drag || !unit) return null;
  const ansi = props.view === 'output';
  const cellShape = ansi && !drag.line && drawsCells(workspaceStore);
  const x0 = Math.floor(Math.min(drag.from.x, drag.to.x)), x1 = Math.floor(Math.max(drag.from.x, drag.to.x)) + 1;
  let y0 = Math.floor(Math.min(drag.from.y, drag.to.y)), y1 = Math.floor(Math.max(drag.from.y, drag.to.y)) + 1;
  if (cellShape) {
    y0 = Math.floor(y0 / 2) * 2;
    y1 = Math.ceil(y1 / 2) * 2;
  }
  const display = unref(props.display);
  const dx = display?.clientLeft ?? 0, dy = display?.clientTop ?? 0;
  if (drag.line || workspaceStore.shapeKind === 'line') {
    // A dashed line between the centers of its end pixels (cells, when it's drawn in cells).
    const center = (p) => (cellShape
      ? { x: (Math.floor(p.x) + 0.5) * unit.x, y: (Math.floor(p.y / 2) * 2 + 1) * unit.y }
      : { x: (Math.floor(p.x) + 0.5) * unit.x, y: (Math.floor(p.y) + 0.5) * unit.y });
    const a = center(drag.from), b = center(drag.to);
    return {
      left: `${a.x + dx}px`, top: `${a.y + dy}px`, width: `${Math.hypot(b.x - a.x, b.y - a.y)}px`, height: '0',
      border: 'none', borderTop: '1px dashed #fff', transformOrigin: '0 0',
      transform: `rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`,
    };
  }
  return {
    left: `${x0 * unit.x + dx}px`, top: `${y0 * unit.y + dy}px`, width: `${(x1 - x0) * unit.x}px`, height: `${(y1 - y0) * unit.y}px`,
    borderRadius: workspaceStore.shapeKind === 'ellipse' ? '50%' : '0',
  };
};
// The drag and, with mirror mode on, its copies on the other sides.
const mirroring = computed(() => workspaceStore.mirror && props.view !== 'vector' && props.unit
  ? mirrorAxes(workspaceStore.rulerZero, projectStore.cols) : null);
const shapeDragStyles = computed(() => {
  const drag = workspaceStore.shapeDrag, axes = mirroring.value;
  if (!drag) return [];
  const copies = (axes ? mirrorOps(axes) : []).map((ops) => ({ ...drag, from: mirrorPoint(drag.from, ops, axes), to: mirrorPoint(drag.to, ops, axes) }))
    .filter(({ from, to }) => Math.max(from.x, to.x) >= 0 && Math.min(from.x, to.x) < projectStore.cols
      && Math.max(from.y, to.y) >= 0 && Math.min(from.y, to.y) < projectStore.rows); // some part of it is on the art
  return [drag, ...copies].map(shapeDragStyle).filter(Boolean);
});

// The axes lie over the art, offset like the drag outline to sit inside the display's border.
const axisStyles = computed(() => {
  if (!mirroring.value) return [];
  const shown = unref(props.display);
  const dx = shown?.clientLeft ?? 0, dy = shown?.clientTop ?? 0;
  return axisLines(mirroring.value, props.unit).map(({ axis, at }) => (axis === 'x'
    ? { left: `${at + dx}px`, top: `${dy}px`, height: `${projectStore.rows * props.unit.y}px`, borderLeft: '1px dashed var(--guide)' }
    : { top: `${at + dy}px`, left: `${dx}px`, width: `${projectStore.cols * props.unit.x}px`, borderTop: '1px dashed var(--guide)' }));
});

// VECTOR: where the pointer is, in grid pixels, while the Pen draws (the overlay's dashed next segment) or Follow a
// path… picks (the shape under it lit).
watch(() => props.view === 'vector' && (workspaceStore.vectorPen || workspaceStore.pickingPath) && isMouseOver.value && mousePos.value, (pos) => {
  const unit = props.unit;
  workspaceStore.vectorHover = pos && unit ? gridAt(pos, unit) : null;
});

// A tool's own pointer over the content (the Select tool's border vs inside), when it has one.
const toolCursor = computed(() => {
  const pos = mousePos.value, unit = props.unit;
  if (!tool.value.cursor || !pos || !isMouseOver.value || !unit) return null;
  return tool.value.cursor(toolCtx(), gridAt(pos, unit));
});

// The character under the pointer, on the grid: for the rulers' moving labels and others' view of where you are.
const hoverCell = computed(() => {
  const pos = mousePos.value, unit = props.unit;
  if (!pos || !isMouseOver.value || !unit) return null;
  const col = Math.floor(pos.x / unit.x), row = Math.floor(gridAt(pos, unit).y / 2);
  return col >= 0 && row >= 0 && col < projectStore.cols && row < charRowsOf(projectStore.rows) ? { col, row } : null;
});

// Sharing: what floats over the drawing area, not scrolled with it, inside this element so that a wheel over it
// comes here (handleWheel) and a press too. A press held when the drawing pauses ends: its stroke, if there is
// one, goes in with the rest of what's waiting, before anything is refused.
const { left: rootLeft, top: rootTop, width: rootWidth, height: rootHeight } = useElementBounding(rootRef);
// It's fixed, but inside the workspace, which slides aside for a phone's settings drawer (a transform): there fixed
// is measured from the workspace, so the box is too, and a measure taken mid-slide holds once it's back.
const frameOf = (el) => {
  for (let a = el?.parentElement; a; a = a.parentElement) if (getComputedStyle(a).transform !== 'none') return a.getBoundingClientRect();
  return { left: 0, top: 0 };
};
const overArt = computed(() => {
  const el = rootRef.value;
  void rootWidth.value, rootHeight.value;   // the client box, short of the scrollbars, isn't reactive: these say when it changes
  const frame = frameOf(el);
  return { left: `${rootLeft.value - frame.left}px`, top: `${rootTop.value - frame.top}px`, width: `${el?.clientWidth ?? 0}px`, height: `${el?.clientHeight ?? 0}px` };
});
watch(() => drawingStore.paused, (paused) => { if (paused) commitPaint(); }, { flush: 'sync' });
watch(hoverCell, (cell) => { if (projectStore._sharing) drawingStore.pointAt(cell); });
// The cell a mouse or pen is over, for Alt+U (commands.js), with the grid pixel row the PIXEL view reads; null off the art.
// Kept as hoverCell is, so a scroll or zoom under a still pointer moves it too, and a finger sets none.
watch(() => hoverCell.value && { ...hoverCell.value, y: Math.floor(gridAt(mousePos.value, props.unit).y) }, (cell) => {
  workspaceStore.pointerCell = cell;
});
// The view goes out when it moves with the pointer still (a wheel, a scrollbar, a zoom, the window), and when drawing
// begins again after a pause, since the host forgot where everyone was while they were away. Someone may be following.
watch(() => [workspaceStore.sharedView, drawingStore.mayDraw, drawingStore.paused], () => drawingStore.viewMoved());
// A stroke with no number yet, while paused.
const waitingStyle = ({ x0, y0, x1, y1 }) => {
  const display = unref(props.display), unit = props.unit;
  if (!unit) return { display: 'none' };
  return {
    left: `${x0 * unit.x + (display?.clientLeft ?? 0)}px`, top: `${y0 * unit.y + (display?.clientTop ?? 0)}px`,
    width: `${(x1 - x0) * unit.x}px`, height: `${(y1 - y0) * unit.y}px`,
  };
};

// An art or SVG file dropped on the drawing: EditWorkspace asks whether to add it at the cell under the drop (or the
// view's top-left, off the art) or open it, so the drop zone around this doesn't open it.
function onDrop(event) {
  const file = event.dataTransfer?.files[0];
  if (!file || !(isArtFile(file.name) || isSvgFile(file.name)) || !projectStore.image) return;
  event.preventDefault();
  event.stopPropagation();
  const pos = props.coordsAt(event);
  workspaceStore.askArt(file, { at: pos && cellAt(pos.x, pos.y, projectStore.cols, projectStore.rows) });
}

// A zoom key (useKeyboardShortcuts): double, halve or the view's own zoom, about the middle of the view.
watch(() => workspaceStore.zoomRequest, (request) => {
  if (!request || !props.zoom) return;
  zoomAtMiddle(request.by ? props.zoom.clamp(props.zoom.get() * request.by) : props.zoom.start);
}, { flush: 'sync' }); // each press, though two land before Vue's next flush

// The pointer over the canvas, for Space (useKeyboardShortcuts): a mouse's or a pen's. A finger isn't over anything
// once it's lifted, and a tap sends no pointerleave.
const overEditor = (e) => { if (e.pointerType !== 'touch') workspaceStore.pointerOverEditor = e.type === 'pointerenter'; };

// The keys that scroll a focused view (Page Up and Down, Home, End, the arrows: Cmd+arrows on a Mac), with nothing
// focused (a file just opened, say) or focus on something that doesn't use the key itself (a tab just clicked), scroll
// this one, as if it had been clicked: it takes the focus first, and the browser's own scroll follows the key.
const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const focusForScroll = (e) => {
  const el = document.activeElement;
  if (!SCROLL_KEYS.has(e.key)) return;
  if (!el || el === document.body || (isControl(el) && !ownsKey(el, e) && !el.closest('dialog, [role="dialog"]'))) rootRef.value?.focus({ preventScroll: true });
};

// The rulers lie over the view's top and left; the content gets room beside them (div.canvas-viewport.ruled),
// so the art's first column and row scroll clear of them.
const ruled = computed(() => workspaceStore.rulers && !!props.unit);
const RULERS = { x: 30, y: 20 }; // CSS px, as thick as GuideRulers.vue's (and div.canvas-viewport.ruled's padding)

// Where the view starts, shown first or on a new document: centered, or with startTop (the ANSI view, read from the
// top as a terminal shows it) at the art's top or left edge on an axis it doesn't fit, beside the rulers.
function placeStart() {
  centerContent();
  const el = rootRef.value, display = unref(props.display);
  if (!props.startTop || !el || !display) return;
  const v = el.getBoundingClientRect(), d = display.getBoundingClientRect(), inset = ruled.value ? RULERS : { x: 0, y: 0 };
  if (d.width > el.clientWidth - inset.x) el.scrollLeft += d.left - v.left - inset.x;
  if (d.height > el.clientHeight - inset.y) el.scrollTop += d.top - v.top - inset.y;
}
// A new document forgets the scroll (newDocument): a view that's showing starts again, after the new grid's layout.
watch(() => workspaceStore[`${props.scrollKey}ScrollY`], (y) => {
  if (y === null) requestAnimationFrame(() => rootRef.value && placeStart());
});

// Padded layout: room to pan the content well past each edge.
const viewportWidth = ref(0);
const viewportHeight = ref(0);
const viewportStyle = computed(() => {
  if (!props.contentSize) return null;
  const { width, height } = props.contentSize;
  return {
    width: viewportWidth.value ? `${width + 2 * Math.max(0, viewportWidth.value - width / 3)}px` : '100%',
    height: viewportHeight.value ? `${height + 2 * Math.max(0, viewportHeight.value - height / 3)}px` : '100%',
  };
});

// Offset of the view center from the content center, so a viewport resize keeps the same spot centered.
const offset = { x: 0, y: 0 };
const onScroll = () => {
  const el = rootRef.value;
  if (!el) return;
  offset.x = (el.scrollLeft + el.clientWidth / 2) - (el.scrollWidth / 2);
  offset.y = (el.scrollTop + el.clientHeight / 2) - (el.scrollHeight / 2);
  workspaceStore[`${props.scrollKey}ScrollX`] = el.scrollLeft;
  workspaceStore[`${props.scrollKey}ScrollY`] = el.scrollTop;
};

const handleResize = () => {
  const el = rootRef.value;
  if (!el) return;
  viewportWidth.value = el.clientWidth;
  viewportHeight.value = el.clientHeight;
  el.scrollLeft = (el.scrollWidth / 2) + offset.x - (el.clientWidth / 2);
  el.scrollTop = (el.scrollHeight / 2) + offset.y - (el.clientHeight / 2);
};

let resizeObserver = null;

onMounted(() => {
  const el = rootRef.value;
  viewportWidth.value = el.clientWidth;
  viewportHeight.value = el.clientHeight;
  el.addEventListener('wheel', handleWheel, { passive: false });
  el.addEventListener('scroll', onScroll);
  window.addEventListener('keydown', focusForScroll, true);

  // Restore the previous scroll position, or center; wait a frame so the content has its size.
  requestAnimationFrame(() => {
    if (!rootRef.value) return;
    const x = workspaceStore[`${props.scrollKey}ScrollX`];
    const y = workspaceStore[`${props.scrollKey}ScrollY`];
    if (x !== null && y !== null) {
      rootRef.value.scrollLeft = x;
      rootRef.value.scrollTop = y;
    } else {
      placeStart();
    }
    onScroll(); // establish the offset before observing resizes

    if (props.contentSize) {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(rootRef.value);
    }
  });
});

onBeforeUnmount(() => {
  commitPaint();
  drawingStore.pointAt(null);   // off the art: another tab has no one's pointer on it
  workspaceStore.pointerCell = null;
  window.removeEventListener('keydown', focusForScroll, true);
  const el = rootRef.value;
  if (el) {
    el.removeEventListener('wheel', handleWheel);
    el.removeEventListener('scroll', onScroll);
  }
  if (resizeObserver) resizeObserver.disconnect();
});

defineExpose({ centerContent });
</script>

<template>
  <article
      ref="root"
      tabindex="0"
      data-art
      :style="{ cursor: toolCursor }"
      @contextmenu.prevent
      @mouseenter="isMouseOver = true"
      @mouseleave="isMouseOver = false"
      @pointerenter="overEditor"
      @pointerleave="overEditor"
      @pointermove="onMouseMove"
      @pointerdown="startPaint"
      @mousedown="startPaint"
      @touchstart.prevent.stop="handleTouchStart"
      @touchmove.prevent.stop="handleTouchMove"
      @touchend.prevent.stop="handleTouchEnd"
      @touchcancel.prevent.stop="handleTouchCancel"
      @drop="onDrop"
  >
    <div v-if="projectStore._sharing || drawingStore.gettingArt" class="over-art" :style="overArt">
      <ArtistCursors v-if="drawingStore.showCursors" :root="rootRef" :display="unref(display)" :unit="unit"/>
      <PauseLayer v-if="drawingStore.paused"/>
    </div>
    <GuideRulers v-if="ruled" :box="overArt" :root="rootRef" :display="unref(display)" :unit="unit" :coords-at="coordsAt" :hover="hoverCell"/>
    <div class="canvas-viewport" :class="{ padded: !!contentSize, ruled }" :style="viewportStyle">
      <div class="canvas-container">
        <slot/>
        <div class="tool-preview" :style="previewStyle"></div>
        <div v-for="(style, i) in shapeDragStyles" :key="i" class="shape-drag" :style="style"></div>
        <div v-for="(style, i) in axisStyles" :key="`axis${i}`" class="mirror-axis" :style="style"></div>
        <div v-for="(box, i) in drawingStore.waiting" :key="i" class="waiting" :style="waitingStyle(box)"></div>
        <slot name="overlay"/>
      </div>
    </div>
  </article>
</template>

<style scoped>
article {
  flex: 1;
  width: 100%;
  height: 100%;
  overflow: auto;
  overflow-anchor: none;
  outline: none;
  -webkit-overflow-scrolling: touch;
  isolation: isolate; /* overlay z-indexes (cursor, marquee) stay below popovers and layers */
}

div.canvas-viewport {
  display: flex;
  min-width: 100%;
  min-height: 100%;
}

div.canvas-viewport.padded {
  display: grid;
  place-items: center;
  min-width: 0;
  min-height: 0;
}

div.canvas-container {
  position: relative;
  margin: auto;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none; /* Crucial: prevent browser default touch handling inside container */
}

/* As thick as the rulers (GuideRulers.vue). Inside the full-width box (border-box), so art that fits shows
   no scrollbar; outside the padded layout's sized one, which keeps its room to pan past each edge. */
div.canvas-viewport.ruled {
  box-sizing: border-box;
  padding: 20px 0 0 30px;
}

div.canvas-viewport.padded.ruled {
  box-sizing: content-box;
}

div.canvas-viewport.padded div.canvas-container {
  margin: 0;
}

div.mirror-axis {
  position: absolute;
  pointer-events: none;
  z-index: 99;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45);
}

div.shape-drag {
  position: absolute;
  box-sizing: border-box;
  pointer-events: none;
  z-index: 100;
  border: 1px dashed #fff;
  box-shadow: 0 0 0 1px #000;
}

div.over-art {
  position: fixed;   /* over the view whatever it's scrolled to; it holds still as the view doesn't move */
  z-index: 150;
  overflow: hidden;
  pointer-events: none;
}

div.waiting {
  position: absolute;
  box-sizing: border-box;
  pointer-events: none;
  z-index: 200;   /* over the pause layer: it's what the layer is about */
  outline: 1px dashed #fff;
  box-shadow: 0 0 0 1px #000;
}

div.tool-preview {
  position: absolute;
  pointer-events: none;
  border: 1px solid #fff;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 1px #000, inset 0 0 0 1px #000;
  z-index: 145;   /* the pointer's own: over the rulers (140) */
}
</style>
