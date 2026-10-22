<script setup>
import { ref, computed } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { getEffectiveColor } from '@/lib/PixelTransforms';
import ColorPopover from '@/components/ColorPopover.vue';

// The foreground/background chips: each shows its colour as it displays (after adjustments and the
// palette); a none slot shows a checkerboard. Clicking a chip opens the picker for that slot.
const project = useProjectStore();
const workspace = useWorkspaceStore();
const open = ref(null); // 'fg' | 'bg' | null

const ansiView = computed(() => workspace.editorTab === 'output');
// ASCII saves white on black: there's nothing to choose in the ANSI view.
const hidden = computed(() => ansiView.value && project.renderStyle === 'ascii');
const shown = (hex) => getEffectiveColor(hex, project, project.activePalette);
// The foreground only means "none" for typing, in the ANSI view; paint always uses its colour.
const fgNone = computed(() => ansiView.value && workspace.editFgNone);

const toggle = (slot) => { open.value = open.value === slot ? null : slot; };
</script>

<template>
  <div v-if="!hidden" class="color-pair">
    <button
        class="chip fg"
        :class="{ none: fgNone }"
        :style="fgNone ? null : { backgroundColor: shown(workspace.editFgColor) }"
        :title="`Foreground: ${fgNone ? 'none' : workspace.editFgColor}`"
        aria-label="Foreground colour"
        @click="toggle('fg')"
    ></button>
    <button
        class="chip bg"
        :class="{ none: workspace.editBgNone }"
        :style="workspace.editBgNone ? null : { backgroundColor: shown(workspace.editBgColor) }"
        :title="`Background: ${workspace.editBgNone ? 'none' : workspace.editBgColor}`"
        aria-label="Background colour"
        @click="toggle('bg')"
    ></button>
    <button class="swap" title="Swap colours (X)" aria-label="Swap colours" @click="workspace.swapColors()">⇄</button>
    <ColorPopover v-if="open" v-model:slot-name="open" @close="open = null"/>
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

button.swap {
  position: absolute;
  right: -6px;
  top: -5px;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
}

button.swap:hover {
  color: var(--text);
}
</style>
