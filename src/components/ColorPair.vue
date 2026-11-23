<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { getEffectiveColor } from '@/lib/PixelTransforms';
import { hex2rgb, rgb2gray } from '@/lib/ColorUtils';
import { shortcut } from '@/lib/keyLabels';
import { useVectorStyle } from '@/composables/useVectorStyle.js';

// The foreground/background chips: each shows its color as it displays (after adjustments and the
// palette); a none slot shows a checkerboard. Clicking a chip opens the color layer (ColorLayer, under the toolbar) on
// that slot's picker, and clicking it again closes it; on the layer's Palettes page either chip goes back to its slot's
// picker (Alt+F / Alt+A and Alt+B open it too: workspace.openColors). On
// VECTOR they're the shapes' Fill and Stroke (useVectorStyle).
const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();

const ansiView = computed(() => workspace.editorTab === 'output');
// Monochrome ASCII shows every cell white on black, but paint still picks the characters by its brightness, so
// in the ANSI view each chip shows the gray its color acts as.
const asGray = computed(() => ansiView.value && project.renderStyle === 'ascii');
const shown = (hex) => {
  const color = getEffectiveColor(hex, project, project.activePalette);
  if (!asGray.value) return color;
  const v = Math.round(rgb2gray(hex2rgb(color)) * 255);
  return `rgb(${v}, ${v}, ${v})`;
};

const toggle = (slot) => {
  if (workspace.colorBox === slot && workspace.colorLayerPage === 'colors') workspace.colorBox = null;
  else workspace.openColors(slot);
};

const vector = computed(() => workspace.editorTab === 'vector');
const style = useVectorStyle();
const SLOTS = { fg: 'fill', bg: 'stroke' };
// One chip as it shows: { none, color (a CSS background), title, aria }; a gradient shows its stops.
const gradientCss = ({ type, stops }) => `${type}-gradient(${type === 'linear' ? '90deg' : 'circle'}, ${stops.map(([o, c]) => `${shown(c)} ${o * 100}%`).join(', ')})`;
const chip = (slot) => {
  const key = shortcut('alt', slot === 'fg' ? 'F' : 'B');
  if (vector.value) {
    const name = SLOTS[slot], hex = style.value(name);
    if (hex && typeof hex === 'object') return { none: false, color: gradientCss(hex), title: t(`vector.${hex.type}${name === 'stroke' ? 'Stroke' : ''}ChipTitle`, { key }), aria: t(`vector.${name}`) };
    return { none: !hex, color: hex && shown(hex), title: t(hex ? `vector.${name}ChipTitle` : `vector.${name}NoneTitle`, { color: hex, key }), aria: t(`vector.${name}`) };
  }
  const none = slot === 'fg' ? workspace.editFgNone : workspace.editBgNone, hex = slot === 'fg' ? workspace.editFgColor : workspace.editBgColor;
  return { none, color: none ? null : shown(hex), title: t(none ? `colors.${slot}NoneTitle` : `colors.${slot}Title`, { color: hex, key }), aria: t(`colors.${slot}Aria`) };
};
</script>

<template>
  <div class="color-pair">
    <button
        v-for="slot in ['fg', 'bg']"
        :key="slot"
        class="chip"
        :class="[slot, { none: chip(slot).none }]"
        :style="chip(slot).none ? null : { background: chip(slot).color }"
        :title="chip(slot).title"
        :aria-label="chip(slot).aria"
        @click="toggle(slot)"
    ></button>
  </div>
</template>

<style scoped>
div.color-pair {
  position: relative;
  width: 42px;
  height: 30px;
  flex: none;
}

button.chip {
  position: absolute;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 2px solid var(--text-dim);
  border-radius: 4px;
  cursor: pointer;
  box-shadow: 0 0 0 1px var(--tooltip);
}

button.chip.fg {
  left: 0;
  top: 0;
  z-index: 2;
}

button.chip.bg {
  left: 13px;
  top: 9px;
}

button.chip.none {
  background: repeating-conic-gradient(#555 0 25%, #333 0 50%) 0 0 / 8px 8px;
}

button.chip.none::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(to top right, transparent 44%, var(--danger) 44% 56%, transparent 56%);
}
</style>
