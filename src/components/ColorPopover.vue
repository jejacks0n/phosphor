<script setup>
import { computed, onMounted, onBeforeUnmount, ref, useTemplateRef } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { getEffectiveColor } from '@/lib/PixelTransforms';
import { swatchSections, drawingColors } from '@/lib/ColorUtils';
import { nearestInDirection } from '@/lib/spatialFocus';
import { shortcut } from '@/lib/keyLabels';

// The color picker for one slot of the pair. Its middle follows the active palette: swatch grids
// for CGA, VGA, custom and adaptive palettes; the native picker plus colors already in use for
// 24-bit. Swatches show how a color displays (adjusted, snapped) and store the color itself, so
// you get exactly the look you clicked.
const props = defineProps({
  slotName: { type: String, required: true }, // 'fg' | 'bg'
});
const emit = defineEmits(['update:slotName', 'close']);

const project = useProjectStore();
const workspace = useWorkspaceStore();
const root = useTemplateRef('root');

const ansiView = computed(() => workspace.editorTab === 'output');
const current = computed(() => (props.slotName === 'fg' ? workspace.editFgColor : workspace.editBgColor));
const isNone = computed(() => (props.slotName === 'fg' ? ansiView.value && workspace.editFgNone : workspace.editBgNone));
// None means "leave what's underneath": a typing choice, so the foreground offers it only in the ANSI view.
const offersNone = computed(() => props.slotName === 'bg' || ansiView.value);

const sections = computed(() => swatchSections(project.quantize, project.activePalette));
// Colors edit cells use, and (folded away until asked for) the other colors in the paint.
// Paint is read when the popover opens: the layer isn't reactive, and doesn't change while this is open.
const inUse = computed(() => drawingColors(project.editCells));
const painted = computed(() => (project.hasPaint ? drawingColors(new Map(), project.paintLayer.colorCounts()).filter(hex => !inUse.value.includes(hex)) : []));
const showPainted = ref(false);
const shown = (hex) => getEffectiveColor(hex, project, project.activePalette);

const choose = (hex, remember = true) => workspace.setColor(props.slotName, hex, { remember });

const onPointerDown = (event) => {
  if (root.value && !root.value.contains(event.target) && !event.target.closest('.color-pair')) emit('close');
};
const onKeyDown = (event) => {
  if (event.key !== 'Escape') return;
  event.preventDefault(); // the popover takes this Escape (not the selection)
  emit('close');
};
// The arrow keys move focus to the nearest control that way (the swatches, None, the recent colors,
// the FG/BG switch); Enter on a swatch picks it and closes the box, Space picks it (as a click does)
// and leaves it open. Taken here, so they don't also nudge a selection or move the text cursor.
const onArrow = (event) => {
  if (event.key === 'Enter' && document.activeElement?.classList.contains('swatch')) {
    event.preventDefault();
    document.activeElement.click();
    emit('close');
    return;
  }
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) || event.altKey || event.metaKey || event.ctrlKey) return;
  event.preventDefault();
  event.stopPropagation();
  const controls = [...root.value.querySelectorAll('button, input')];
  const from = document.activeElement;
  if (!controls.includes(from)) return controls[0]?.focus();
  const next = nearestInDirection(from.getBoundingClientRect(), controls.map((el) => el.getBoundingClientRect()), event.key);
  if (next >= 0) controls[next].focus();
};
onMounted(() => {
  // Focus starts on the slot's color, so the arrows go from there.
  (root.value?.querySelector('.swatch.selected') ?? root.value?.querySelector('button'))?.focus();
  document.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('keydown', onKeyDown, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown, true);
  window.removeEventListener('keydown', onKeyDown, true);
});
</script>

<template>
  <div ref="root" class="color-popover" role="dialog" aria-label="Color picker" @keydown="onArrow">
    <div class="head">
      <button :class="{ on: slotName === 'fg' }" @click="emit('update:slotName', 'fg')">FG</button>
      <button :class="{ on: slotName === 'bg' }" @click="emit('update:slotName', 'bg')">BG</button>
      <span class="spacer"></span>
      <button class="swap" :title="`Swap foreground and background (X or ${shortcut('shift', 'mod', 'X')})`" @click="workspace.swapColors()">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2 1 5l3 3V6h8V4H4zm8 6v2H4v2h8v2l3-3z"/></svg>
        Swap
      </button>
    </div>

    <div v-for="(section, i) in sections" :key="i" class="swatches" :style="{ gridTemplateColumns: `repeat(${section.columns}, 1fr)` }">
      <button
          v-for="color in section.colors"
          :key="color.hex + color.c"
          class="swatch"
          :class="{ selected: !isNone && current.toLowerCase() === color.hex.toLowerCase() }"
          :style="{ backgroundColor: shown(color.hex) }"
          :title="color.hex"
          @click="choose(color.hex.toLowerCase())"
      ></button>
    </div>

    <template v-if="!sections.length">
      <label class="native">
        <input type="color" :value="current" @input="choose($event.target.value, false)" @change="choose($event.target.value)"/>
        <span>{{ current }}</span>
      </label>
      <div v-if="inUse.length" class="row-label">In this drawing</div>
      <div v-if="inUse.length" class="swatches" style="grid-template-columns: repeat(8, 1fr)">
        <button v-for="hex in inUse" :key="hex" class="swatch" :style="{ backgroundColor: shown(hex) }" :title="hex" @click="choose(hex)"></button>
      </div>
      <button v-if="painted.length" class="row-label fold" :aria-expanded="showPainted" @click="showPainted = !showPainted">
        {{ showPainted ? '▾' : '▸' }} Painted ({{ painted.length }})
      </button>
      <div v-if="showPainted && painted.length" class="swatches" style="grid-template-columns: repeat(8, 1fr)">
        <button v-for="hex in painted" :key="hex" class="swatch" :style="{ backgroundColor: shown(hex) }" :title="hex" @click="choose(hex)"></button>
      </div>
    </template>

    <div class="foot">
      <button v-if="offersNone" class="swatch none" :class="{ selected: isNone }" title="None: leave what's underneath" @click="choose(null)"></button>
      <span v-if="offersNone">None</span>
      <span class="spacer"></span>
      <button
          v-for="hex in workspace.recentColors"
          :key="hex"
          class="swatch small"
          :style="{ backgroundColor: shown(hex) }"
          :title="`Recent: ${hex}`"
          @click="choose(hex)"
      ></button>
    </div>
  </div>
</template>

<style scoped>
div.color-popover {
  position: absolute;
  top: 36px;
  left: 0;
  z-index: 200;
  width: 260px;
  padding: 10px;
  background: var(--surface-1);
  border: 1px solid var(--accent);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

div.head,
div.foot {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
}

div.head button {
  padding: 3px 8px;
  border: none;
  border-radius: 4px;
  background: var(--surface-3);
  color: var(--text-dim);
  font-size: 11px;
  cursor: pointer;
}

div.head button.swap {
  display: flex;
  align-items: center;
  gap: 5px;
}

div.head button.swap:hover {
  background: var(--surface-4);
  color: var(--text);
}

div.head button.swap svg {
  width: 12px;
  height: 12px;
  fill: currentColor;
}

div.head button.on {
  background: var(--accent);
  color: var(--white);
}

.spacer {
  flex: 1;
}

div.swatches {
  display: grid;
  gap: 1px;
}

button.swatch {
  height: 18px;
  min-width: 0;
  padding: 0;
  border: none;
  border-radius: 2px;
  cursor: pointer;
}

button.swatch.small {
  width: 14px;
  height: 14px;
}

button.swatch.selected {
  outline: 2px solid var(--white);
  outline-offset: 1px;
  position: relative;
  z-index: 1;
}

/* Where the arrow keys are (the selected color keeps its white ring when it isn't focused). */
button.swatch:focus-visible {
  outline: 2px solid var(--accent-hot);
  outline-offset: 1px;
  position: relative;
  z-index: 2;
}

button.swatch.none {
  width: 18px;
  position: relative;
  background: repeating-conic-gradient(#555 0 25%, #333 0 50%) 0 0 / 8px 8px;
}

button.swatch.none::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(to top right, transparent 44%, var(--danger) 44% 56%, transparent 56%);
}

label.native {
  display: flex;
  align-items: center;
  gap: 8px;
  font: 12px ui-monospace, Menlo, monospace;
  color: var(--text-dim);
}

label.native input {
  width: 48px;
  height: 32px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
}

div.row-label,
button.row-label {
  font-size: 11px;
  color: var(--text-muted);
}

button.fold {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  box-shadow: none;
  font-weight: normal;
  cursor: pointer;
}

button.fold:hover {
  transform: none;
  box-shadow: none;
  color: var(--text);
}
</style>
