<script setup>
import { computed, onMounted, onBeforeUnmount, useTemplateRef } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { getEffectiveColor } from '@/lib/PixelTransforms';
import { swatchSections, authoredColors } from '@/lib/ColorUtils';

// The colour picker for one slot of the pair. Its middle follows the active palette: swatch grids
// for CGA, VGA, custom and adaptive palettes; the native picker plus colours already in use for
// 24-bit. Swatches show how a colour displays (adjusted, snapped) and store the colour itself, so
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
const inUse = computed(() => authoredColors(project.cellEdits));
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
onMounted(() => {
  root.value?.querySelector('button')?.focus();
  document.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('keydown', onKeyDown, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown, true);
  window.removeEventListener('keydown', onKeyDown, true);
});
</script>

<template>
  <div ref="root" class="color-popover" role="dialog" aria-label="Colour picker">
    <div class="head">
      <button :class="{ on: slotName === 'fg' }" @click="emit('update:slotName', 'fg')">FG</button>
      <button :class="{ on: slotName === 'bg' }" @click="emit('update:slotName', 'bg')">BG</button>
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

div.row-label {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
