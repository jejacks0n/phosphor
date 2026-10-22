<script setup>
import { ref, computed, useTemplateRef, onMounted, onBeforeUnmount } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useEditorInteractions } from '@/composables/useEditorInteractions';
import { getTool } from '@/tools';
import { charRowsOf } from '@/lib/Cells';

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
  toolContext: { type: Object, default: () => ({}) },       // editor extras for tools (e.g. openCharPicker)
  hidePreview: { type: Boolean, default: false },
});

const projectStore = useProjectStore();
const workspaceStore = useWorkspaceStore();
const tool = computed(() => getTool(workspaceStore.activeTool));
const toolCtx = () => ({ project: projectStore, workspace: workspaceStore, view: props.view, ...props.toolContext });
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
  updateMousePos,
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
    // Picks repeat while dragging, so they don't fill the recent colours.
    onColorPick: (pos) => workspaceStore.setColor('fg', projectStore.rawColorAt(pos.x, pos.y), { remember: false }),
    onZoomChange: (zoom) => workspaceStore.setEditZoom(zoom),
  },
});

// Brush/eraser outline under the pointer, or the character cell for cell tools.
const CELL_HIGHLIGHT = { borderRadius: '0', transform: 'none', mixBlendMode: 'difference', background: 'white', outline: '1px solid red', border: 'none', boxShadow: 'none' };
const previewStyle = computed(() => {
  const preview = tool.value.preview;
  const pos = mousePos.value, unit = props.unit;
  if (!preview || !pos || !isMouseOver.value || !unit || props.hidePreview) return { display: 'none' };

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

defineExpose({ centerContent, updateMousePos });
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
