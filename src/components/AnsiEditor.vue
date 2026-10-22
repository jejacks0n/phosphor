<script setup>
import { ref, computed, useTemplateRef, watch, onMounted, onBeforeUnmount } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useTextTool } from '@/composables/useTextTool';
import { render as renderText } from '@/lib/TextRenderer';
import { getContext, calcMetrics } from '@/lib/AnsiRuntime';
import { charRowsOf } from '@/lib/Cells';
import EditorViewport from '@/components/EditorViewport.vue';
import CharPicker from '@/components/CharPicker.vue';
import AnsiStatusBar from '@/components/AnsiStatusBar.vue';
import SelectionBar from '@/components/SelectionBar.vue';

// The ANSI view: cells rendered as text in a <pre>; a grid pixel is half a character cell tall.
const projectStore = useProjectStore();
const workspaceStore = useWorkspaceStore();
useTextTool(projectStore, workspaceStore);
const viewport = useTemplateRef('viewport');
const displayRef = useTemplateRef('pre');

const picker = ref(null);
const metrics = ref(null);
let renderFrame = null;

// Character cell size in CSS px, measured from the <pre>'s font (null until it can be measured).
const ensureMetrics = () => {
  if (!metrics.value && displayRef.value) metrics.value = calcMetrics(displayRef.value);
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

  const context = getContext({
    element: displayRef.value,
    cols: projectStore.cols,
    rows: charRowsOf(projectStore.rows),
  }, m);

  const buffer = projectStore.cells.map(({ char, fg, bg }) => ({
    char,
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
  return {
    x: (clientX - rect.left) / m.cellWidth,
    y: (clientY - rect.top) / (m.lineHeight / 2),
  };
};

// CSS px per grid pixel (a grid pixel is half a character cell tall), for tool previews.
const unit = computed(() => (metrics.value ? { x: metrics.value.cellWidth, y: metrics.value.lineHeight / 2 } : null));

// The char tool asks for a picker on a cell; the picker is positioned on screen next to it.
const openCharPicker = (col, row) => {
  const m = ensureMetrics();
  if (!m || !displayRef.value) return;
  const rect = displayRef.value.getBoundingClientRect();
  const targetRect = { left: rect.left + col * m.cellWidth + 2, top: rect.top + row * m.lineHeight + 2, width: m.cellWidth, height: m.lineHeight };
  picker.value = { col, row, targetRect };
};
const toolContext = { openCharPicker };

// The Text tool's cursor: a blinking outline on its cell.
const cursorStyle = computed(() => {
  const m = metrics.value, cursor = workspaceStore.textCursor;
  if (!m || !cursor || workspaceStore.activeTool !== 'text') return { display: 'none' };
  return {
    display: 'block',
    width: `${m.cellWidth}px`,
    height: `${m.lineHeight}px`,
    left: `${cursor.col * m.cellWidth + 2}px`,
    top: `${cursor.row * m.lineHeight + 1}px`,
  };
});

// The selection: marching ants (offset while it's being dragged), with its actions under it, or
// above it near the bottom.
const selectionBox = computed(() => {
  const m = metrics.value, sel = workspaceStore.selection;
  if (!m || !sel) return null;
  const { dc, dr } = workspaceStore.selectionOffset ?? { dc: 0, dr: 0 };
  const left = (sel.c0 + dc) * m.cellWidth + 2, top = (sel.r0 + dr) * m.lineHeight + 1;
  const height = (sel.r1 - sel.r0 + 1) * m.lineHeight;
  const below = sel.r1 + dr < charRowsOf(projectStore.rows) - 3;
  return {
    marquee: { left: `${left}px`, top: `${top}px`, width: `${(sel.c1 - sel.c0 + 1) * m.cellWidth}px`, height: `${height}px` },
    bar: below ? { left: `${left}px`, top: `${top + height + 8}px` } : { left: `${left}px`, top: `${Math.max(top + 4, top - 36)}px` },
  };
});

// While the picker is open, its cell stays highlighted.
const pinnedStyle = computed(() => {
  const m = metrics.value;
  if (!picker.value || !m) return { display: 'none' };
  return {
    display: 'block',
    width: `${m.cellWidth}px`,
    height: `${m.lineHeight}px`,
    left: `${picker.value.col * m.cellWidth + 2}px`,
    top: `${picker.value.row * m.lineHeight + 1}px`,
  };
});

const pickerChars = computed(() => {
  const chars = projectStore.processParams.chars;
  if (!chars) return [];
  return [...new Set(chars.split(''))].filter(c => c.trim());
});

const closePicker = (event) => {
  if (event) viewport.value?.updateMousePos(event);
  picker.value = null;
};

const selectChar = (char, event) => {
  if (!picker.value) return;
  // The last edit to a cell wins: picking a character removes the paint over it.
  projectStore.editCell(picker.value.col, picker.value.row, { char: char === 'ERASE' ? null : char }, { clearPaint: true });
  closePicker(event);
  projectStore.commitEdit();
};

// The first content renders immediately so it's laid out before the viewport restores/centres its
// scroll on the next frame; later updates (e.g. every paint move) coalesce to one render per frame.
watch(() => projectStore.cells, () => (displayRef.value?.childElementCount ? queueRender() : render()));
watch(() => [projectStore.cols, projectStore.rows], () => {
  metrics.value = null;
  queueRender();
});

onMounted(() => {
  render(); // same reason as the cells watcher: lay out before the viewport's scroll restore
  if (document.fonts) {
    document.fonts.ready.then(() => {
      if (!displayRef.value) return; // unmounted meanwhile
      metrics.value = null;
      queueRender();
    });
  }
});

onBeforeUnmount(() => {
  if (renderFrame) cancelAnimationFrame(renderFrame);
});
</script>

<template>
  <div class="ansi-editor">
  <EditorViewport
      ref="viewport"
      :display="displayRef"
      :coords-at="coordsAt"
      scroll-key="ansi"
      view="output"
      :unit="unit"
      :tool-context="toolContext"
      :hide-preview="!!picker"
  >
    <pre ref="pre" :style="{ pointerEvents: 'none' }"></pre>
    <div class="interaction-overlay"></div>
    <CharPicker
        v-if="picker"
        :chars="pickerChars"
        :target-rect="picker.targetRect"
        @select="selectChar"
        @close="closePicker"
    />
    <template #overlay>
      <div class="picker-cell" :style="pinnedStyle"></div>
      <div class="text-cursor" :style="cursorStyle"></div>
      <template v-if="selectionBox">
        <div class="marquee" :style="selectionBox.marquee"></div>
        <SelectionBar v-if="!workspaceStore.selectionOffset" :rect="workspaceStore.selection" :style="selectionBox.bar"/>
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

.text-cursor {
  position: absolute;
  box-sizing: border-box;
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

pre {
  margin: 0;
  padding: 0;
  /* GlyphCoverage.DISPLAY_FONT must match this font, size and line-height */
  font-family: 'JetBrains Mono', monospace;
  font-size: 17px;
  line-height: 1.2;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  white-space: pre;
  background: var(--surface-dark);
  border: 2px dashed var(--border-light);
  display: block;
  user-select: none;
  -webkit-user-select: none;
  text-rendering: optimizeSpeed;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
  -webkit-text-size-adjust: none;
}

.picker-cell {
  position: absolute;
  pointer-events: none;
  mix-blend-mode: difference;
  background: white;
  outline: 1px solid red;
  z-index: 1000;
}
</style>
