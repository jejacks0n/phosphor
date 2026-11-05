<script setup>
import { ref, computed, unref, useTemplateRef, watch, onMounted, onBeforeUnmount } from 'vue';
import { useElementBounding } from '@vueuse/core';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useDrawingStore } from '@/store/DrawingStore';
import ArtistCursors from '@/components/social/ArtistCursors.vue';
import PauseLayer from '@/components/social/PauseLayer.vue';
import { useEditorInteractions } from '@/composables/useEditorInteractions';
import { getTool } from '@/tools';
import { charRowsOf, cellAt, cellsOfPixels } from '@/lib/Cells';
import { squarePixels } from '@/lib/Brushes';
import { pickMode, pickTargetOf } from '@/lib/pickMode';
import { drawsCells } from '@/tools/shapes';
import { snapCursor } from '@/document/wideChars';
import { isArtFile } from '@/lib/ArtFile';
import { isSvgFile } from '@/lib/SvgFile.js';
import { withShape } from '@/document/shapes.js';

// The scrollable, pannable, zoomable shell both editors sit in. The editor supplies the display
// element (slot) and how pointer events map to grid pixels (coordsAt); the active tool (src/tools)
// decides what a stroke does. coordsAt and zoom are read once at setup: pass stable values.
const props = defineProps({
  display: { type: Object, default: null },                 // the sizer (or the DOM view's pre) that coordinates are measured against
  coordsAt: { type: Function, required: true },             // (event) => { x, y } in fractional grid pixels, or null
  zoom: { type: Object, default: null },                    // { get, set, clamp, drag? } for the view's zoom; null: not zoomable
  scrollKey: { type: String, required: true },              // 'input' | 'ansi': where scroll position is remembered
  contentSize: { type: Object, default: null },             // { width, height } -> padded layout that keeps its center on resize
  view: { type: String, required: true },                   // 'input' (PIXEL) | 'output' (ANSI) | 'vector' (VECTOR), passed to tools
  unit: { type: Object, default: null },                    // { x, y }: CSS px per grid pixel, for tool previews
});

const projectStore = useProjectStore();
const workspaceStore = useWorkspaceStore();
const drawingStore = useDrawingStore();
const tool = computed(() => getTool(workspaceStore.activeTool));
const toolCtx = () => ({ project: projectStore, workspace: workspaceStore, view: props.view, unit: props.unit });
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
    onPaintStart: (event, pos) => (!projectStore._paused && tool.value.begin ? tool.value.begin(toolCtx(), pos, event) !== false : false),
    onPaintMove: (from, to) => tool.value.move?.(toolCtx(), from, to),
    onPaintEnd: () => tool.value.end?.(toolCtx()),
    // A stroke a pinch interrupted: what it drew is taken back, then the tool's cancel (or its end) runs.
    onPaintCancel: () => {
      projectStore.cancelEdit();
      (tool.value.cancel ?? tool.value.end)?.(toolCtx());
    },
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
  // The pixel view, and a picker held with Alt from a drawing tool, pick exactly the half under the
  // pointer: into the foreground, or with Alt+Shift the background.
  if (props.view === 'input' || workspaceStore.pickSwapped) {
    workspaceStore.pickColor(mode === 'bg' ? 'bg' : 'fg', projectStore.rawColorAt(pos.x, pos.y));
    return;
  }
  const at = cellAt(pos.x, pos.y, projectStore.cols, projectStore.rows);
  if (!at) return;
  const cell = snapCursor(projectStore.cells, projectStore.cols, at, 0); // a wide character's trail: its lead's colors
  const under = projectStore.underlyingAt(cell.col, cell.row);
  const entry = projectStore.editCellAt(cell.col, cell.row);
  // Color ASCII never shows a generated background: only an edit cell's is real.
  const bg = projectStore.renderStyle === 'colorAscii' && !entry?.bg ? null : under.bg;
  // For the status bar: what this pick read, and which layer each color came from (paint and edit
  // cells are the edit layer; the rest is the base).
  const fromEdit = (y, attr) => !!projectStore.paintLayer?.colorAt(cell.col, y) || entry?.[attr] !== undefined;
  workspaceStore.lastPick = {
    col: cell.col, row: cell.row, fg: under.fg, bg,
    fgFrom: fromEdit(2 * cell.row + 1, 'fg') ? 'edit' : 'base',
    bgFrom: fromEdit(2 * cell.row, 'bg') ? 'edit' : 'base',
  };
  if (mode === 'fg' || mode === 'both') workspaceStore.pickColor('fg', under.fg);
  if (mode === 'bg' || mode === 'both') workspaceStore.pickColor('bg', bg);
}

// Brush/eraser outline under the pointer, or the character cell for cell tools.
const gridPos = (pos) => ({ x: pos.x / props.unit.x, y: pos.y / props.unit.y });
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

  const size = preview.size(workspaceStore);
  // The eraser outlines exactly what it covers: whole cells in the ANSI view, pixels in the pixel view.
  if (preview.snap) {
    const square = squarePixels(gridPos(pos), gridPos(pos), size, projectStore.cols, projectStore.rows);
    const ansi = props.view === 'output';
    const parts = ansi ? cellsOfPixels(square, projectStore.cols, projectStore.rows).map(c => ({ x: c.col, y: c.row })) : square;
    if (!parts.length) return { display: 'none' };
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
  const display = unref(props.display); // pos is inside its border; the preview sits in its box
  return {
    display: 'block',
    width: `${size * unit.x}px`,
    height: `${size * unit.y}px`,
    left: `${pos.x + (display?.clientLeft ?? 0)}px`,
    top: `${pos.y + (display?.clientTop ?? 0)}px`,
    borderRadius: preview.shape === 'square' ? '0' : '50%',
  };
});

// The Shapes tool's drag outline (grid positions -> CSS px), drawn while dragging: the rect, its ellipse, or the line
// (the Paint Bucket's gradient line too: line, between grid pixels).
// In the ANSI view a line/character rectangle snaps to whole cells, so its outline does too; it sits
// inside the display's border, like the cursor and cell highlights.
const shapeDragStyle = computed(() => {
  const drag = workspaceStore.shapeDrag, unit = props.unit;
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
      border: 'none', borderTop: '1px dashed var(--white)', transformOrigin: '0 0',
      transform: `rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`,
    };
  }
  return {
    left: `${x0 * unit.x + dx}px`, top: `${y0 * unit.y + dy}px`, width: `${(x1 - x0) * unit.x}px`, height: `${(y1 - y0) * unit.y}px`,
    borderRadius: workspaceStore.shapeKind === 'ellipse' ? '50%' : '0',
  };
});

// VECTOR: where the pointer is, in grid pixels, while the Pen draws (the overlay's dashed next segment).
watch(() => props.view === 'vector' && workspaceStore.vectorPen && isMouseOver.value && mousePos.value, (pos) => {
  const unit = props.unit;
  workspaceStore.vectorHover = pos && unit ? { x: pos.x / unit.x, y: pos.y / unit.y } : null;
});

// A tool's own pointer over the content (the Select tool's border vs inside), when it has one.
const toolCursor = computed(() => {
  const pos = mousePos.value, unit = props.unit;
  if (!tool.value.cursor || !pos || !isMouseOver.value || !unit) return null;
  return tool.value.cursor(toolCtx(), { x: pos.x / unit.x, y: pos.y / unit.y });
});

// Sharing: what floats over the drawing area, not scrolled with it, inside this element so that a wheel over it
// comes here (handleWheel) and a press too. A press held when the drawing pauses ends: its stroke, if there is
// one, goes in with the rest of what's waiting, before anything is refused.
const { left: rootLeft, top: rootTop, width: rootWidth, height: rootHeight } = useElementBounding(rootRef);
const overArt = computed(() => {
  const el = rootRef.value;
  void rootWidth.value, rootHeight.value;   // the client box, short of the scrollbars, isn't reactive: these say when it changes
  return { left: `${rootLeft.value}px`, top: `${rootTop.value}px`, width: `${el?.clientWidth ?? 0}px`, height: `${el?.clientHeight ?? 0}px` };
});
watch(() => drawingStore.paused, (paused) => { if (paused) commitPaint(); }, { flush: 'sync' });
watch([mousePos, isMouseOver], ([pos, over]) => {
  const unit = props.unit;
  if (!projectStore._sharing) return;
  if (!pos || !over || !unit) return drawingStore.pointAt(null);
  const col = Math.floor(pos.x / unit.x), row = Math.floor(pos.y / unit.y / 2);
  drawingStore.pointAt(col >= 0 && row >= 0 && col < projectStore.cols && row < charRowsOf(projectStore.rows) ? { col, row } : null);
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
  workspaceStore.artDrop = { file, at: pos && cellAt(pos.x, pos.y, projectStore.cols, projectStore.rows) };
}

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

  // Restore the previous scroll position, or center; wait a frame so the content has its size.
  requestAnimationFrame(() => {
    if (!rootRef.value) return;
    const x = workspaceStore[`${props.scrollKey}ScrollX`];
    const y = workspaceStore[`${props.scrollKey}ScrollY`];
    if (x !== null && y !== null) {
      rootRef.value.scrollLeft = x;
      rootRef.value.scrollTop = y;
    } else {
      centerContent();
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
      :style="{ cursor: toolCursor }"
      @contextmenu.prevent
      @mouseenter="isMouseOver = workspaceStore.pointerOverEditor = true"
      @mouseleave="isMouseOver = workspaceStore.pointerOverEditor = false"
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
    <div class="canvas-viewport" :class="{ padded: !!contentSize }" :style="viewportStyle">
      <div class="canvas-container">
        <slot/>
        <div class="tool-preview" :style="previewStyle"></div>
        <div v-if="shapeDragStyle" class="shape-drag" :style="shapeDragStyle"></div>
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

div.canvas-viewport.padded div.canvas-container {
  margin: 0;
}

div.shape-drag {
  position: absolute;
  box-sizing: border-box;
  pointer-events: none;
  z-index: 100;
  border: 1px dashed var(--white);
  box-shadow: 0 0 0 1px var(--black);
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
  outline: 1px dashed var(--white);
  box-shadow: 0 0 0 1px var(--black);
}

div.tool-preview {
  position: absolute;
  pointer-events: none;
  border: 1px solid var(--white);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 1px var(--black), inset 0 0 0 1px var(--black);
  z-index: 100;
}
</style>
