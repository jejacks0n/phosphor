<script setup>
import { ref, computed, unref, useTemplateRef, onMounted, onBeforeUnmount } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useEditorInteractions } from '@/composables/useEditorInteractions';
import { getTool } from '@/tools';
import { charRowsOf, cellAt, cellsOfPixels } from '@/lib/Cells';
import { squarePixels } from '@/lib/Brushes';
import { pickMode, pickTargetOf } from '@/lib/pickMode';
import { drawsCells } from '@/tools/shapes';
import { snapCursor } from '@/document/wideChars';

// The scrollable, pannable, zoomable shell both editors sit in. The editor supplies the display
// element (slot) and how pointer events map to grid pixels (coordsAt); the active tool (src/tools)
// decides what a stroke does. coordsAt and zoom are read once at setup: pass stable values.
const props = defineProps({
  display: { type: Object, default: null },                 // the sizer (or the DOM view's pre) that coordinates are measured against
  coordsAt: { type: Function, required: true },             // (event) => { x, y } in fractional grid pixels, or null
  zoom: { type: Object, default: null },                    // { get, set, clamp } for the view's zoom; null: not zoomable
  scrollKey: { type: String, required: true },              // 'input' | 'ansi': where scroll position is remembered
  contentSize: { type: Object, default: null },             // { width, height } -> padded layout that keeps its center on resize
  view: { type: String, required: true },                   // 'input' (PIXEL) | 'output' (ANSI), passed to tools
  unit: { type: Object, default: null },                    // { x, y }: CSS px per grid pixel, for tool previews
});

const projectStore = useProjectStore();
const workspaceStore = useWorkspaceStore();
const tool = computed(() => getTool(workspaceStore.activeTool));
const toolCtx = () => ({ project: projectStore, workspace: workspaceStore, view: props.view });
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
  workspaceStore,
  disableZoom: !props.zoom,
  callbacks: {
    pixelCoordsAt: props.coordsAt,
    onPaintStart: (event, pos) => (tool.value.begin ? tool.value.begin(toolCtx(), pos, event) !== false : false),
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

// The eyedropper: the pixel view picks the paint color; the ANSI view picks the cell's underlying
// colors (the [FG][BG] toggles; Shift: foreground only, Alt: background only). Picks repeat while
// dragging; the recent colors get the old and new colors when the pick ends (workspace.endPick).
function pickAt(pos, event) {
  if (pos.x < 0 || pos.y < 0 || pos.x >= projectStore.cols || pos.y >= projectStore.rows) return; // off the grid
  const mode = pickMode({
    view: props.view,
    shiftKey: !!event?.shiftKey,
    altKey: !!event?.altKey,
    swapped: workspaceStore.pickSwapped,
    target: pickTargetOf(workspaceStore.pickLayers),
  });
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

// The Shapes tool's drag outline (grid positions -> CSS px), drawn while dragging: the rect, its ellipse, or the line.
// In the ANSI view a line/character rectangle snaps to whole cells, so its outline does too; it sits
// inside the display's border, like the cursor and cell highlights.
const shapeDragStyle = computed(() => {
  const drag = workspaceStore.shapeDrag, unit = props.unit;
  if (!drag || !unit) return null;
  const ansi = props.view === 'output';
  const cellShape = ansi && drawsCells(workspaceStore);
  const x0 = Math.floor(Math.min(drag.from.x, drag.to.x)), x1 = Math.floor(Math.max(drag.from.x, drag.to.x)) + 1;
  let y0 = Math.floor(Math.min(drag.from.y, drag.to.y)), y1 = Math.floor(Math.max(drag.from.y, drag.to.y)) + 1;
  if (cellShape) {
    y0 = Math.floor(y0 / 2) * 2;
    y1 = Math.ceil(y1 / 2) * 2;
  }
  const display = unref(props.display);
  const dx = display?.clientLeft ?? 0, dy = display?.clientTop ?? 0;
  if (workspaceStore.shapeKind === 'line') {
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

// A tool's own pointer over the content (the Select tool's border vs inside), when it has one.
const toolCursor = computed(() => {
  const pos = mousePos.value, unit = props.unit;
  if (!tool.value.cursor || !pos || !isMouseOver.value || !unit) return null;
  return tool.value.cursor(toolCtx(), { x: pos.x / unit.x, y: pos.y / unit.y });
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
  >
    <div class="canvas-viewport" :class="{ padded: !!contentSize }" :style="viewportStyle">
      <div class="canvas-container">
        <slot/>
        <div class="tool-preview" :style="previewStyle"></div>
        <div v-if="shapeDragStyle" class="shape-drag" :style="shapeDragStyle"></div>
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
