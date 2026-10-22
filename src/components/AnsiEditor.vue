<script setup>
import { ref, computed, useTemplateRef, watch, onMounted, onBeforeUnmount } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { render as renderText } from '@/lib/TextRenderer';
import { getContext, calcMetrics } from '@/lib/AnsiRuntime';
import { charRowsOf } from '@/lib/Cells';
import EditorViewport from '@/components/EditorViewport.vue';
import CharPicker from '@/components/CharPicker.vue';

// The ANSI view: cells rendered as text in a <pre>; a grid pixel is half a character cell tall.
const projectStore = useProjectStore();
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
  projectStore.setCharEdit(picker.value.col, picker.value.row, char === 'ERASE' ? null : char);
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
    </template>
  </EditorViewport>
</template>

<style scoped>
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
