<script setup>
import { ref, computed, useTemplateRef, onMounted, onBeforeUnmount } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useEditorInteractions } from '@/composables/useEditorInteractions';
import { getTool } from '@/tools';
import { charRowsOf, cellAt } from '@/lib/Cells';
import { pickMode } from '@/lib/pickMode';

// The scrollable, pannable, zoomable shell both editors sit in. The editor supplies the display
// element (slot) and how pointer events map to grid pixels (coordsAt); the active tool (src/tools)
// decides what a stroke does. coordsAt and zoomable are read once at setup: pass stable values.
const props = defineProps({
  display: { type: Object, default: null },                 // the slotted canvas/pre coordinates are measured against
  coordsAt: { type: Function, required: true },             // (event) => { x, y } in fractional grid pixels, or null
  zoomable: { type: Boolean, default: false },              // zoom reads and writes workspaceStore.editZoom
  scrollKey: { type: String, required: true },              // 'input' | 'ansi': where scroll position is remembered
  contentSize: { type: Object, default: null },             // { width, height } -> padded layout that keeps its centre on resize
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
  // The store, not a prop: several zoom events can land in one frame, before a prop would update.
  editZoom: computed(() => workspaceStore.editZoom),
  workspaceStore,
  disableZoom: !props.zoomable,
  callbacks: {
    pixelCoordsAt: props.coordsAt,
    onPaintStart: (event, pos) => (tool.value.begin ? tool.value.begin(toolCtx(), pos, event) !== false : false),
    onPaintMove: (from, to) => tool.value.move?.(toolCtx(), from, to),
    onPaintEnd: () => tool.value.end?.(toolCtx()),
    onColorPick: pickAt,
    onZoomChange: (zoom) => workspaceStore.setEditZoom(zoom),
  },
});

// The eyedropper: the pixel view picks the paint colour; the ANSI view picks the cell's underlying
// colours (the FG/BG/Both option; Shift: foreground only, Alt: background only). Picks repeat while
// dragging, so they don't fill the recent colours.
function pickAt(pos, event) {
  const mode = pickMode({
    view: props.view,
    shiftKey: !!event?.shiftKey,
    altKey: !!event?.altKey,
    swapped: workspaceStore.pickSwapped,
    target: workspaceStore.pickTarget,
  });
  const remember = { remember: false };
  // The pixel view, and a picker held with Alt from a paint tool, pick exactly the half under the pointer.
  if (props.view === 'input' || workspaceStore.pickSwapped) {
    workspaceStore.setColor('fg', projectStore.rawColorAt(pos.x, pos.y), remember);
    return;
  }
  const cell = cellAt(pos.x, pos.y, projectStore.cols, projectStore.rows);
  if (!cell) return;
  const under = projectStore.underlyingAt(cell.col, cell.row);
  // Color ASCII never shows a generated background: only an authored one is real.
  const bg = projectStore.renderStyle === 'colorAscii' && !projectStore.cellEditAt(cell.col, cell.row)?.bg ? null : under.bg;
  if (mode === 'fg' || mode === 'both') workspaceStore.setColor('fg', under.fg, remember);
  if (mode === 'bg' || mode === 'both') workspaceStore.setColor('bg', bg, remember);
}

// Brush/eraser outline under the pointer, or the character cell for cell tools.
const CELL_HIGHLIGHT = { borderRadius: '0', transform: 'none', mixBlendMode: 'difference', background: 'white', outline: '1px solid red', border: 'none', boxShadow: 'none' };
const previewStyle = computed(() => {
  const preview = tool.value.preview;
  const pos = mousePos.value, unit = props.unit;
  if (!preview || !pos || !isMouseOver.value || !unit) return { display: 'none' };

  if (preview.shape === 'cell') {
    const cellW = unit.x, cellH = unit.y * 2;
    const col = Math.floor(pos.x / cellW), row = Math.floor(pos.y / cellH);
    if (col < 0 || row < 0 || col >= projectStore.cols || row >= charRowsOf(projectStore.rows)) return { display: 'none' };
    return { display: 'block', width: `${cellW}px`, height: `${cellH}px`, left: `${col * cellW + 2}px`, top: `${row * cellH + 1}px`, ...CELL_HIGHLIGHT };
  }

  const size = preview.size(workspaceStore);
  return {
    display: 'block',
    width: `${size * unit.x}px`,
    height: `${size * unit.y}px`,
    left: `${pos.x}px`,
    top: `${pos.y}px`,
    borderRadius: preview.shape === 'square' ? '0' : '50%',
  };
});

// The Shapes tool's drag rectangle (grid positions -> CSS px), drawn while dragging.
// In the ANSI view a line/character rectangle snaps to whole cells, so its outline does too; ANSI
// overlays sit inside the display's 2px/1px border, like the cursor and cell highlights.
const shapeDragStyle = computed(() => {
  const drag = workspaceStore.shapeDrag, unit = props.unit;
  if (!drag || !unit) return null;
  const ansi = props.view === 'output';
  const cellShape = ansi && workspaceStore.shapeKind === 'rect' && workspaceStore.shapeDrawWith !== 'half';
  const x0 = Math.floor(Math.min(drag.from.x, drag.to.x)), x1 = Math.floor(Math.max(drag.from.x, drag.to.x)) + 1;
  let y0 = Math.floor(Math.min(drag.from.y, drag.to.y)), y1 = Math.floor(Math.max(drag.from.y, drag.to.y)) + 1;
  if (cellShape) {
    y0 = Math.floor(y0 / 2) * 2;
    y1 = Math.ceil(y1 / 2) * 2;
  }
  const [dx, dy] = ansi ? [2, 1] : [0, 0];
  return { left: `${x0 * unit.x + dx}px`, top: `${y0 * unit.y + dy}px`, width: `${(x1 - x0) * unit.x}px`, height: `${(y1 - y0) * unit.y}px` };
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

// Offset of the view centre from the content centre, so a viewport resize keeps the same spot centred.
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

  // Restore the previous scroll position, or centre; wait a frame so the content has its size.
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
      @contextmenu.prevent
      @mouseenter="isMouseOver = true"
      @mouseleave="isMouseOver = false"
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
