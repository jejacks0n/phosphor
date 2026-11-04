<script setup>
import { computed, onMounted, onBeforeUnmount, ref, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { getEffectiveColor, paletteChoices } from '@/lib/PixelTransforms';
import { swatchSections, drawingColors } from '@/lib/ColorUtils';
import { nearestInDirection } from '@/lib/spatialFocus';
import { shortcut } from '@/lib/keyLabels';
import { useVectorStyle } from '@/composables/useVectorStyle.js';
import { gradientKey, gradientSlot, recolorStop } from '@/tools/vgradient.js';

// The color picker for one slot of the pair. Its middle follows the active palette: swatch grids
// for CGA, VGA, custom and adaptive palettes; the native picker plus colors already in use for
// 24-bit. A palette swatch stores a color that displays as its palette color under the color
// adjustments (paletteChoices), so every palette color can be painted with; other swatches show
// how their color displays (adjusted, snapped) and store the color itself.
// On VECTOR the slots are the shapes' Fill and Stroke (useVectorStyle), each of which can be none, and the selected
// shapes' Fill and Stroke can each be Solid, Linear or Radial; with the Gradient tool's stop selected, the chip for
// the gradient it edits (gradientSlot) is that stop's color.
const props = defineProps({
  slotName: { type: String, required: true }, // 'fg' | 'bg'
});
const emit = defineEmits(['update:slotName', 'close']);

const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();
const root = useTemplateRef('root');

const ansiView = computed(() => workspace.editorTab === 'output');
const vector = computed(() => workspace.editorTab === 'vector');
const style = useVectorStyle();
const SHAPE_SLOTS = { fg: 'fill', bg: 'stroke' };
// A gradient shows as its first stop; choosing a color makes it solid again.
const solidOf = (v) => (v && typeof v === 'object' ? v.stops[0][1] : v);
const stop = computed(() => {
  if (!vector.value || workspace.activeTool !== 'vgradient' || workspace.vectorStop === null) return null;
  const key = gradientKey(project, workspace), shape = key && project.shapes.get(key);
  if (!shape) return null;
  const slot = gradientSlot(shape, workspace);
  return (slot === SHAPE_SLOTS[props.slotName] && shape[slot].stops[workspace.vectorStop]?.[1]) || null;
});
const current = computed(() => stop.value ?? (vector.value ? solidOf(style.value(SHAPE_SLOTS[props.slotName])) ?? '#000000' : props.slotName === 'fg' ? workspace.editFgColor : workspace.editBgColor));
const KINDS = ['solid', 'linear', 'radial'];
const isNone = computed(() => (vector.value ? !style.value(SHAPE_SLOTS[props.slotName]) : props.slotName === 'fg' ? ansiView.value && workspace.editFgNone : workspace.editBgNone));
// None means "leave what's underneath": a typing choice, so the foreground offers it only in the ANSI view. A
// shape can go without either.
const offersNone = computed(() => !stop.value && (vector.value || props.slotName === 'bg' || ansiView.value));

// The palette as the colors its swatches store.
const sections = computed(() => {
  const palette = project.activePalette ?? [];
  const choices = paletteChoices(project, palette);
  return swatchSections(project.quantize, palette.map((p, i) => ({ ...p, hex: choices[i] })));
});
// Colors edit cells use, and (folded away until asked for) the other colors in the paint.
// Paint is read when the popover opens: the layer isn't reactive, and doesn't change while this is open.
const inUse = computed(() => drawingColors(project.editCells));
const painted = computed(() => (project.hasPaint ? drawingColors(new Map(), project.paintLayer.colorCounts()).filter(hex => !inUse.value.includes(hex)) : []));
const showPainted = ref(false);
const shown = (hex) => getEffectiveColor(hex, project, project.activePalette);

const choose = (hex, remember = true) => {
  if (!vector.value) return workspace.setColor(props.slotName, hex, { remember });
  if (hex && remember) workspace.rememberColor(hex);
  if (stop.value) return recolorStop(project, workspace, hex, { remember });
  style.set(SHAPE_SLOTS[props.slotName], hex, { remember });
};
const swap = () => (vector.value ? style.swap() : workspace.swapColors());

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
  <div ref="root" class="color-popover" role="dialog" :aria-label="t('colors.popoverAria')" @keydown="onArrow">
    <div class="head">
      <button :class="{ on: slotName === 'fg' }" @click="emit('update:slotName', 'fg')">{{ vector ? t('vector.fill') : t('colors.fg') }}</button>
      <button :class="{ on: slotName === 'bg' }" @click="emit('update:slotName', 'bg')">{{ vector ? t('vector.stroke') : t('colors.bg') }}</button>
      <span class="spacer"></span>
      <button class="swap" :title="t('colors.swapTitle', { key: shortcut('shift', 'mod', 'X') })" @click="swap">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2 1 5l3 3V6h8V4H4zm8 6v2H4v2h8v2l3-3z"/></svg>
        {{ t('colors.swap') }}
      </button>
    </div>

    <div v-if="vector" class="kinds">
      <button
          v-for="kind in KINDS"
          :key="kind"
          :aria-pressed="style.kindOf(SHAPE_SLOTS[slotName]) === kind"
          :disabled="!style.editing.value"
          :title="t(`vector.${kind}Title`)"
          @click="style.setKind(SHAPE_SLOTS[slotName], kind)"
      >{{ t(`vector.${kind}`) }}</button>
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
      <div v-if="inUse.length" class="row-label">{{ t('colors.inThisDrawing') }}</div>
      <div v-if="inUse.length" class="swatches" style="grid-template-columns: repeat(8, 1fr)">
        <button v-for="hex in inUse" :key="hex" class="swatch" :style="{ backgroundColor: shown(hex) }" :title="hex" @click="choose(hex)"></button>
      </div>
      <button v-if="painted.length" class="row-label fold" :aria-expanded="showPainted" @click="showPainted = !showPainted">
        {{ t('colors.painted', { arrow: showPainted ? '▾' : '▸', count: painted.length }) }}
      </button>
      <div v-if="showPainted && painted.length" class="swatches" style="grid-template-columns: repeat(8, 1fr)">
        <button v-for="hex in painted" :key="hex" class="swatch" :style="{ backgroundColor: shown(hex) }" :title="hex" @click="choose(hex)"></button>
      </div>
    </template>

    <div class="foot">
      <button v-if="offersNone" class="swatch none" :class="{ selected: isNone }" :title="t('colors.noneTitle')" @click="choose(null)"></button>
      <span v-if="offersNone">{{ t('colors.none') }}</span>
      <span class="spacer"></span>
      <button
          v-for="hex in workspace.recentColors"
          :key="hex"
          class="swatch small"
          :style="{ backgroundColor: shown(hex) }"
          :title="t('colors.recentTitle', { hex })"
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

div.head button.swap svg {
  width: 12px;
  height: 12px;
  fill: currentColor;
}

div.head button.on {
  background: var(--accent);
  color: var(--white);
}

div.kinds {
  display: flex;
  gap: 4px;
}

div.kinds button {
  flex: 1;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--text-dim);
  font-size: 11px;
  cursor: pointer;
}

div.kinds button[aria-pressed='true'] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--white);
}

div.kinds button:disabled {
  opacity: 0.4;
  cursor: default;
}

div.swatches {
  display: grid;
  gap: 2px;
}

button.swatch {
  aspect-ratio: 1;
  padding: 0;
  border: 1px solid var(--border-light);
  border-radius: 2px;
  cursor: pointer;
}

button.swatch.selected {
  outline: 2px solid var(--white);
  outline-offset: -1px;
  box-shadow: 0 0 0 1px var(--black);
}

button.swatch.small {
  width: 12px;
  height: 12px;
}

button.swatch.none {
  position: relative;
  width: 16px;
  height: 16px;
  background: repeating-conic-gradient(#555 0 25%, #333 0 50%) 0 0 / 6px 6px;
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
  font-size: 11px;
  font-family: monospace;
  color: var(--text-dim);
  cursor: pointer;
}

label.native input[type="color"] {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: none;
  cursor: pointer;
}

div.row-label {
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}

button.row-label.fold {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
  cursor: pointer;
}

button.row-label.fold:hover {
  color: var(--accent-hot);
}

.spacer {
  flex: 1;
}
</style>
