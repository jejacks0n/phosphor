<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { getEffectiveColor } from '@/lib/PixelTransforms';
import { hex2rgb, rgb2gray } from '@/lib/ColorUtils';
import { shortcut } from '@/lib/keyLabels';
import { useVectorStyle } from '@/composables/useVectorStyle.js';
import ColorPopover from '@/components/ColorPopover.vue';

// The foreground/background chips: each shows its color as it displays (after adjustments and the
// palette); a none slot shows a checkerboard. Clicking a chip opens the picker for that slot (so do
// Alt+F / Alt+A and Alt+B: workspace.colorBox). On VECTOR they're the shapes' Fill and Stroke (useVectorStyle),
// and the picker picks for them alone.
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
// The foreground only means "none" for typing, in the ANSI view; paint always uses its color.
const fgNone = computed(() => ansiView.value && workspace.editFgNone);

const toggle = (slot) => { workspace.colorBox = workspace.colorBox === slot ? null : slot; };

const vector = computed(() => workspace.editorTab === 'vector');
const style = useVectorStyle();
const SLOTS = { fg: 'fill', bg: 'stroke' };
// One chip as it shows: { none, color, title, aria }.
const chip = (slot) => {
  const key = shortcut('alt', slot === 'fg' ? 'F' : 'B');
  if (vector.value) {
    const name = SLOTS[slot], hex = style.value(name);
    return { none: !hex, color: hex && shown(hex), title: t(hex ? `vector.${name}ChipTitle` : `vector.${name}NoneTitle`, { color: hex, key }), aria: t(`vector.${name}`) };
  }
  const none = slot === 'fg' ? fgNone.value : workspace.editBgNone, hex = slot === 'fg' ? workspace.editFgColor : workspace.editBgColor;
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
        :style="chip(slot).none ? null : { backgroundColor: chip(slot).color }"
        :title="chip(slot).title"
        :aria-label="chip(slot).aria"
        @click="toggle(slot)"
    ></button>
    <ColorPopover
        v-if="workspace.colorBox && vector"
        :value="style.value(SLOTS[workspace.colorBox])"
        offers-none
        @pick="(hex, opts) => style.set(SLOTS[workspace.colorBox], hex, opts)"
        @close="workspace.colorBox = null"
    />
    <ColorPopover v-else-if="workspace.colorBox" v-model:slot-name="workspace.colorBox" @close="workspace.colorBox = null"/>
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
  box-shadow: 0 0 0 1px var(--black);
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
